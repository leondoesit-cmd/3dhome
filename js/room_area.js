import { roomMeasurements } from './room_summary.js';
import { wallCurveGeom } from './wall_curves.js';
import { wallLayerBands } from './wall_types.js';
import { roomTypeOf } from './room_types.js';

// Geometric clear floor area, not a regulatory or whole-building measurement.
// A void that actually crosses this room, and a solid that crosses it, stay
// unresolved until polygon subtraction exists. A void in some other room does not.
function voidHitsRoom(opening, bounds) {
  if (!Number.isFinite(Number(opening?.x)) || !Number.isFinite(Number(opening?.z))) return false;
  const rot = (Number(opening.rot) || 0) * Math.PI / 180;
  const c = Math.abs(Math.cos(rot)), s = Math.abs(Math.sin(rot));
  const hw = Math.abs(Number(opening.w) || 0) / 2, hd = Math.abs(Number(opening.d) || 0) / 2;
  const ex = hw * c + hd * s, ez = hw * s + hd * c;
  return opening.x - ex < bounds.x1 && opening.x + ex > bounds.x0
    && opening.z - ez < bounds.z1 && opening.z + ez > bounds.z0;
}

export function roomClearArea(state, room) {
  const measurement = roomMeasurements(state, room);
  const bounds = measurement?.interiorBounds;
  if (!bounds) return {area:null, reason:'geometry'};
  if ((state.slabOpenings || []).some((opening) => voidHitsRoom(opening, bounds))) return {area:null, reason:'voids'};
  const own = new Set(String(room.key).split(','));
  const catalog = JSON.parse(JSON.stringify({wallTypes:state.wallTypes || [],walls:[]}));
  for (const original of state.walls) {
    if (own.has(String(original.id))) continue;
    const wall = JSON.parse(JSON.stringify(original));
    const geom = wallCurveGeom(wall,state.nodes);
    if (!geom || geom.kind !== 'line') return {area:null,reason:'solids'};
    const bands = wallLayerBands(wall,catalog);
    const offset = wall.loc === 'face' && Math.abs(wall.dimSide) === 1 ? -wall.dimSide*wall.thickness/2 : 0;
    const lo = Math.min(...bands.map(b=>b.start))+offset;
    const hi = Math.max(...bands.map(b=>b.end))+offset;
    const points = [geom.a,geom.b].flatMap(p=>[lo,hi].map(d=>({x:p.x-geom.uz*d,z:p.z+geom.ux*d})));
    if (Math.min(...points.map(p=>p.x)) < bounds.x1-1e-6 && Math.max(...points.map(p=>p.x)) > bounds.x0+1e-6 &&
        Math.min(...points.map(p=>p.z)) < bounds.z1-1e-6 && Math.max(...points.map(p=>p.z)) > bounds.z0+1e-6)
      return {area:null,reason:'solids'};
  }
  return {area:measurement.interior.width*measurement.interior.depth/10000,reason:null,bounds};
}

export function floorClearAreas(state, rooms) {
  const entries = rooms.map(room=>({key:room.key,...roomClearArea(state,room),type:roomTypeOf(state.roomMeta?.[room.key])}));
  const overlapping = new Set();
  for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++){
    const a=entries[i].bounds,b=entries[j].bounds;
    if(a&&b&&Math.min(a.x1,b.x1)>Math.max(a.x0,b.x0)+1e-6&&Math.min(a.z1,b.z1)>Math.max(a.z0,b.z0)+1e-6){overlapping.add(i);overlapping.add(j);}
  }
  let indoor=0,outdoor=0,unclassified=0,unresolved=0;
  entries.forEach((entry,index)=>{
    if(overlapping.has(index)){entry.area=null;entry.reason='overlap';}
    if(entry.area===null){unresolved++;return;}
    if(['balcony','terrace'].includes(entry.type))outdoor+=entry.area;
    else if(entry.type)indoor+=entry.area;
    else unclassified+=entry.area;
  });
  return {entries,indoor,outdoor,unclassified,unresolved};
}

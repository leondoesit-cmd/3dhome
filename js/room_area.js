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

// Rendering queries rooms individually. Reuse the analysis only after checking
// the complete JSON project inputs, including in-place layers/catalogue/node
// edits. Openings in walls do not affect this conservative floor-solid test.
// Non-JSON node containers (supported by wallCurveGeom) use the uncached path.
const solidAnalyses = new WeakMap();
function projectSolidIndex(state) {
  if (!Array.isArray(state.nodes)) return solidIndex(state);
  const signature=JSON.stringify([state.nodes,state.walls,state.wallTypes || []]);
  const saved=solidAnalyses.get(state);
  if(saved?.signature===signature)return saved.index;
  const index=solidIndex(state);
  solidAnalyses.set(state,{signature,index});
  return index;
}

// Sorted x bounds plus prefix maxima let a room skip distant wall solids.
function solidIndex(state) {
  const catalog = JSON.parse(JSON.stringify({wallTypes:state.wallTypes || [],walls:[]}));
  const invalid = [], solids = [];
  for (const original of state.walls) {
    const wall = JSON.parse(JSON.stringify(original));
    const geom = wallCurveGeom(wall,state.nodes);
    if (!geom) { invalid.push(String(original.id)); continue; }
    const bands = wallLayerBands(wall,catalog);
    const offset = wall.loc === 'face' && Math.abs(wall.dimSide) === 1 ? -wall.dimSide*wall.thickness/2 : 0;
    const lo = Math.min(...bands.map(b=>b.start))+offset;
    const hi = Math.max(...bands.map(b=>b.end))+offset;
    if (geom.kind !== 'line') {
      const radius = geom.radius + Math.max(Math.abs(lo),Math.abs(hi));
      solids.push({id:String(original.id),arc:true,x0:geom.center.x-radius,x1:geom.center.x+radius,z0:geom.center.z-radius,z1:geom.center.z+radius});
    } else {
      const points = [geom.a,geom.b].flatMap(p=>[lo,hi].map(d=>({x:p.x-geom.uz*d,z:p.z+geom.ux*d})));
      solids.push({id:String(original.id),x0:Math.min(...points.map(p=>p.x)),x1:Math.max(...points.map(p=>p.x)),z0:Math.min(...points.map(p=>p.z)),z1:Math.max(...points.map(p=>p.z))});
    }
  }
  solids.sort((a,b)=>a.x0-b.x0);
  const maxima = []; let maximum = -Infinity;
  for (const solid of solids) { maximum=Math.max(maximum,solid.x1); maxima.push(maximum); }
  return {invalid,solids,maxima};
}

function clearArea(state, room, getIndex) {
  const measurement = roomMeasurements(state, room);
  const bounds = measurement?.interiorBounds;
  if (!bounds) return {area:null, reason:'geometry'};
  if ((state.slabOpenings || []).some((opening) => voidHitsRoom(opening, bounds))) return {area:null, reason:'voids'};
  const own = new Set(String(room.key).split(','));
  const {invalid,solids,maxima} = getIndex();
  if (invalid.some(id=>!own.has(id))) return {area:null,reason:'solids'};
  let low=0,high=solids.length;
  while(low<high){const mid=(low+high)>>>1;if(solids[mid].x0<=bounds.x1)low=mid+1;else high=mid;}
  for(let i=low-1;i>=0&&maxima[i]>=bounds.x0;i--){
    const solid=solids[i];
    if(own.has(solid.id))continue;
    // Preserve the original conservative full-circle test (including touching
    // bounds) for arcs, and its strict tolerance for straight wall faces.
    if(solid.arc ? !(solid.x1<bounds.x0||solid.x0>bounds.x1||solid.z1<bounds.z0||solid.z0>bounds.z1) :
      solid.x0<bounds.x1-1e-6&&solid.x1>bounds.x0+1e-6&&solid.z0<bounds.z1-1e-6&&solid.z1>bounds.z0+1e-6)
      return {area:null,reason:'solids'};
  }
  return {area:measurement.interior.width*measurement.interior.depth/10000,reason:null,bounds};
}

export function roomClearArea(state, room) {
  return clearArea(state, room, () => projectSolidIndex(state));
}

export function floorClearAreas(state, rooms) {
  let index;
  const getIndex=()=>index ||= projectSolidIndex(state);
  const entries = rooms.map(room=>({key:room.key,...clearArea(state,room,getIndex),type:roomTypeOf(state.roomMeta?.[room.key])}));
  const overlapping = new Set();
  const sorted=entries.map((entry,index)=>({bounds:entry.bounds,index})).filter(e=>e.bounds).sort((a,b)=>a.bounds.x0-b.bounds.x0);
  for(let i=0;i<sorted.length;i++)for(let j=i+1;j<sorted.length&&sorted[j].bounds.x0<sorted[i].bounds.x1-1e-6;j++){
    const a=sorted[i].bounds,b=sorted[j].bounds;
    if(Math.min(a.x1,b.x1)>Math.max(a.x0,b.x0)+1e-6&&Math.min(a.z1,b.z1)>Math.max(a.z0,b.z0)+1e-6){overlapping.add(sorted[i].index);overlapping.add(sorted[j].index);}
  }
  let indoor=0,outdoor=0,unclassified=0,unresolved=0;
  entries.forEach((entry,index)=>{
    if(overlapping.has(index)){entry.area=null;entry.reason='overlap';}
    if(entry.area===null){unresolved++;return;}
    if(['balcony','terrace','serviceBalcony'].includes(entry.type))outdoor+=entry.area;
    else if(entry.type)indoor+=entry.area;
    else unclassified+=entry.area;
  });
  return {entries,indoor,outdoor,unclassified,unresolved};
}

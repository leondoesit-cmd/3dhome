import {wallLayerBands} from "./wall_types.js";
import {S} from './state.js';
import {wallOutline,wallBandOutline,wallPointAt,wallTangentAt,detectRooms} from './geometry.js';
import {doorSwingPoly} from './swing_clearance.js';
import {openingCorners} from './slab_openings.js';
import {footprint} from './layout_analysis.js';
import {roomMeasurements} from './room_summary.js';
export function drawingSnapshot(){
 const catalog=JSON.parse(JSON.stringify({wallTypes:S.wallTypes||[],walls:[]}));
 const bandsFor=wall=>wallLayerBands(JSON.parse(JSON.stringify(wall)),catalog);
 const openings=S.openings.map(opening=>{
  const wall=S.walls.find(w=>w.id===opening.wall);if(!wall)return [];
  const bands=bandsFor(wall),lo=Math.min(...bands.map(b=>b.start))-.1,hi=Math.max(...bands.map(b=>b.end))+.1;
  const left=[],right=[],steps=wall.geometry?.type==='arc'?16:1;
  for(let i=0;i<=steps;i++){
   const s=opening.s-opening.width/2+opening.width*i/steps,p=wallPointAt(wall,s),n=wallTangentAt(wall,s);
   left.push({x:p.x-n.z*hi,z:p.z+n.x*hi});right.push({x:p.x-n.z*lo,z:p.z+n.x*lo});
  }
  return [...left,...right.reverse()];
 }).filter(p=>p.length);
 return {walls:S.walls.flatMap(w=>w.geometry?.type==='arc'?[wallOutline(w)]:bandsFor(w).map(b=>{const p=wallBandOutline(w,b.start,b.end);return p?[p.a0,p.b0,p.b1,p.a1]:null;})).filter(Boolean),openings,
  swings:S.openings.map(o=>doorSwingPoly(o)).filter(Boolean),voids:(S.slabOpenings||[]).map(openingCorners),items:S.items.map(i=>footprint(i)),
  rooms:detectRooms().map(room=>({points:room.pts,cx:room.cx,cz:room.cz,name:S.roomMeta[room.key]?.name||'',...roomMeasurements(S,room)?.interior}))};
}

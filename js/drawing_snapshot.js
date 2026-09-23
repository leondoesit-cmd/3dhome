import {wallLayerBands} from "./wall_types.js";
import {S} from './state.js';
import {wallOutline,wallBandOutline,wallPointAt,wallTangentAt,detectRooms} from './geometry.js';
import {doorSwingPoly} from './swing_clearance.js';
import {openingCorners} from './slab_openings.js';
import {footprint} from './layout_analysis.js';
import {roomMeasurements} from './room_summary.js';
import {FURN,vspec} from './furniture.js';
import {spriteMode} from './plan_sprite_key.js';
import {activeFloorArea} from './area_snapshot.js';
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
 return {surveyFeatures:JSON.parse(JSON.stringify(S.surveyFeatures||[])),walls:S.walls.flatMap(w=>w.geometry?.type==='arc'?[wallOutline(w)]:bandsFor(w).map(b=>{const p=wallBandOutline(w,b.start,b.end);return p?[p.a0,p.b0,p.b1,p.a1]:null;})).filter(Boolean),openings,
  swings:S.openings.map(o=>doorSwingPoly(o)).filter(Boolean),voids:(S.slabOpenings||[]).map(openingCorners),items:S.items.map(i=>footprint(i)),
  rooms:detectRooms().map(room=>({points:room.pts,cx:room.cx,cz:room.cz,name:S.roomMeta[room.key]?.name||'',...roomMeasurements(S,room)?.interior}))};
}

/* What the construction sheet (js/drawing_sheet.js) needs, on top of the
   plain snapshot: each opening's type beside its rectangle, the fixtures a
   builder's plan shows (not ceiling fittings, not the uppers hung above the
   cut), the rooms with their interior size, and the living area. */
export function sheetSnapshot(){
 const base=drawingSnapshot();
 const typed=S.openings.map((o,i)=>({o,i})).filter(({o})=>S.walls.some(w=>w.id===o.wall));
 const openings=typed.map(({o},k)=>({type:o.type,poly:base.openings[k]})).filter(x=>x.poly&&x.poly.length);
 const items=S.items.filter(it=>it.w>0&&it.d>0&&FURN[it.type]&&!FURN[it.type].lamp&&spriteMode(it,{lamp:false})==='sprite')
  .map(it=>({type:it.type,x:it.x,z:it.z,w:it.w,d:it.d,rot:it.rot||0,steps:it.steps,shape:vspec(it).shape,configuration:it.configuration?JSON.parse(JSON.stringify(it.configuration)):undefined}));
 let area=null;
 try{const r=activeFloorArea();const m2=(r.indoor||0)+(r.unclassified||0);area={m2:r.unresolved&&!m2?null:m2};}catch(e){area=null;}
 if(area&&area.m2==null)area.m2=detectRooms().reduce((a,r)=>a+r.area/10000,0);
 const floor=S.workspace&&Array.isArray(S.workspace.floors)?S.workspace.floors.find(f=>f.id===S.workspace.activeFloor):null;
 return {wallPolys:base.walls,openings,swings:base.swings,items,rooms:base.rooms,area,floorName:floor?floor.name:''};
}

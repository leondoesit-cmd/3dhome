import {wallLayerBands} from "./wall_types.js";
import {S} from './state.js';
import {wallOutline,wallBandOutline,wallPointAt,wallTangentAt,detectRooms,pointInPoly} from './geometry.js';
import {doorSwingPolys} from './swing_clearance.js';
import {wallInkAll} from './wall_ink.js';
import {openingCorners} from './slab_openings.js';
import {footprint} from './layout_analysis.js';
import {roomMeasurements} from './room_summary.js';
import {FURN,vspec} from './furniture.js';
import {spriteMode} from './plan_sprite_key.js';
import {activeFloorArea} from './area_snapshot.js';
import {roomClearArea} from './room_area.js';
export function drawingSnapshot(){
 const catalog=JSON.parse(JSON.stringify({wallTypes:S.wallTypes||[],walls:[]}));
 const bandsFor=wall=>wallLayerBands(JSON.parse(JSON.stringify(wall)),catalog);
 const openings=S.openings.map(opening=>{
  const wall=S.walls.find(w=>String(w.id)===String(opening.wall));if(!wall)return [];
  const bands=bandsFor(wall),lo=Math.min(...bands.map(b=>b.start))-.1,hi=Math.max(...bands.map(b=>b.end))+.1;
  const left=[],right=[],steps=wall.geometry?.type==='arc'?16:1;
  for(let i=0;i<=steps;i++){
   const s=opening.s-opening.width/2+opening.width*i/steps,p=wallPointAt(wall,s),n=wallTangentAt(wall,s);
   left.push({x:p.x-n.z*hi,z:p.z+n.x*hi});right.push({x:p.x-n.z*lo,z:p.z+n.x*lo});
  }
  return [...left,...right.reverse()];
 }).filter(p=>p.length);
 return {surveyFeatures:JSON.parse(JSON.stringify(S.surveyFeatures||[])),walls:S.walls.flatMap(w=>w.geometry?.type==='arc'?[wallOutline(w)]:bandsFor(w).map(b=>{const p=wallBandOutline(w,b.start,b.end,undefined,true);return p?[p.a0,p.b0,p.b1,p.a1]:null;})).filter(Boolean),openings,
  swings:S.openings.flatMap(o=>doorSwingPolys(o)),voids:(S.slabOpenings||[]).map(openingCorners),items:S.items.map(i=>footprint(i)),
  rooms:detectRooms().map(room=>({points:room.pts,cx:room.cx,cz:room.cz,name:S.roomMeta[room.key]?.name||'',...roomMeasurements(S,room)?.interior}))};
}

/* What the construction sheet (js/drawing_sheet.js) needs, on top of the
   plain snapshot: each opening's type beside its rectangle, the fixtures a
   builder's plan shows (not ceiling fittings, not the uppers hung above the
   cut), the rooms with their interior size, and the living area. */
export function sheetSnapshot(){
 const base=drawingSnapshot();
 const typed=S.openings.map((o,i)=>({o,i})).filter(({o})=>S.walls.some(w=>w.id===o.wall));
 const openings=typed.map(({o},k)=>({id:o.id,type:o.type,poly:base.openings[k],width:+o.width||0,height:+o.height||0,sill:+o.sill||0})).filter(x=>x.poly&&x.poly.length);
 const items=S.items.filter(it=>it.w>0&&it.d>0&&FURN[it.type]&&!FURN[it.type].lamp&&spriteMode(it,{lamp:false})==='sprite')
  .map(it=>({id:it.id,type:it.type,x:it.x,z:it.z,w:it.w,d:it.d,rot:it.rot||0,steps:it.steps,shape:vspec(it).shape,configuration:it.configuration?JSON.parse(JSON.stringify(it.configuration)):undefined}));
 let area=null;
 try{const r=activeFloorArea();const m2=(r.indoor||0)+(r.unclassified||0);area={m2:r.unresolved&&!m2?null:m2};}catch(e){area=null;}
 if(area&&area.m2==null)area.m2=detectRooms().reduce((a,r)=>a+r.area/10000,0);
 const floors=S.workspace&&Array.isArray(S.workspace.floors)?S.workspace.floors:[];
 const floor=floors.find(f=>f.id===S.workspace.activeFloor)||null;
 // the regional sheet's labels: each room's clear area (m², the reference
 // polygon where walls do not close a clear rectangle), the storey's level in
 // cm and its number counted up from the lowest storey (US room numbers 101…)
 const detected=detectRooms();
 const rooms=base.rooms.map((r,i)=>{const room=detected[i];let m2=null,clear=null;try{m2=room?roomClearArea(S,room).area:null;}catch(e){m2=null;}try{clear=room?roomMeasurements(S,room)?.interiorBounds||null:null;}catch(e){clear=null;}return {...r,key:room?room.key:undefined,clear,area:m2!=null?m2:room?room.area/10000:0};});
 const order=floors.slice().sort((a,b)=>(+a.elevation||0)-(+b.elevation||0));
 const floorNumber=floor?order.indexOf(floor)+1:1;
 return {wallPolys:base.walls,walls:sheetWalls(detected),openings,swings:base.swings,items,rooms,area,floorName:floor?floor.name:'',level:floor?+floor.elevation||0:0,floorNumber};
}

/* The regional sheet's walls (js/drawing_sheet/hatches.js): each wall's
   outline, the pieces of it that are inked (js/wall_ink.js: no line between
   two walls of one material) and its along-wall layer lines, its layer bands
   with their material for the hatch, and whether it is exterior: a point just
   off either face that lies in no room means the wall faces outside. The
   snapshot's wallPolys (the plain sheet and every dimension chain) stay on the
   face meeting points, so no dimension depends on how a corner is built. */
function sheetWalls(rooms){
 const catalog=JSON.parse(JSON.stringify({wallTypes:S.wallTypes||[],walls:[]}));
 const inks=wallInkAll(S.walls);
 const inRoom=(x,z)=>rooms.some(r=>r.pts&&pointInPoly(x,z,r.pts));
 return S.walls.map(w=>{
  let bands=[];try{bands=wallLayerBands(JSON.parse(JSON.stringify(w)),catalog);}catch(e){bands=[];}
  const arc=w.geometry?.type==='arc',outline=wallOutline(w);
  const lo=bands.length?Math.min(...bands.map(b=>b.start)):-(w.thickness||10)/2,hi=bands.length?Math.max(...bands.map(b=>b.end)):(w.thickness||10)/2;
  const na=S.nodes[w.a],nb=S.nodes[w.b],len=na&&nb?Math.hypot(nb.x-na.x,nb.z-na.z):0;
  let exterior=true;
  if(len>0){const p=wallPointAt(w,len/2),t=wallTangentAt(w,len/2),nx=-t.z,nz=t.x,a=hi+20,b=lo-20;exterior=!(inRoom(p.x+nx*a,p.z+nz*a)&&inRoom(p.x+nx*b,p.z+nz*b));}
  const main=bands.find(b=>b.main)||bands[0]||{};
  const polys=arc||!bands.length?[{poly:outline,material:main.material||'generic-masonry',role:main.role,structural:main.structural!==false}]
   :bands.map(b=>{const q=wallBandOutline(w,b.start,b.end);return q?{poly:[q.a0,q.b0,q.b1,q.a1],material:b.material,role:b.role,structural:!!b.structural}:null;}).filter(Boolean);
  const ink=inks.get(w),inked=ink&&!ink.arc;
  return {id:w.id,outline:outline&&outline.length>2?outline:null,exterior,bands:polys.filter(b=>b.poly&&b.poly.length>2),ink:inked?ink.paths:null,layerLines:inked?ink.layers:null};
 });
}

import {S} from './state.js';
import {detectRooms,wallBandOutline,wallGeom} from './geometry.js';
import {wallLayerBands} from './wall_types.js';
import {normalizeWallKind} from './wall_curves.js';
import {openingCorners} from './slab_openings.js';
import {projectAreaReport} from './project_area.js';

let signature="", cached=null;
export function activeFloorArea(){
 const key=JSON.stringify([S.nodes,S.walls,S.wallTypes,S.openings,S.slabOpenings,S.roomMeta]);
 if(key===signature&&cached)return cached;
 const rooms=detectRooms(),wallSolids=[],apertures=[];let unresolved=false;
 const catalog=JSON.parse(JSON.stringify({wallTypes:S.wallTypes||[],walls:[]}));
 for(const original of S.walls){
  const wall=JSON.parse(JSON.stringify(original));
  const bands=wallLayerBands(wall,catalog),geom=wallGeom(wall);
  if(!geom||geom.kind==='arc'||['roomDivider','railing','half'].includes(normalizeWallKind(wall))||['demolition','demolish'].includes(wall.phase)){unresolved=true;continue;}
  for(const band of bands){
   const outline=wallBandOutline(wall,band.start,band.end);
   if(!outline){unresolved=true;continue;}
   wallSolids.push({id:wall.id,points:[outline.a0,outline.b0,outline.b1,outline.a1]});
  }
  const lo=Math.min(...bands.map(b=>b.start)),hi=Math.max(...bands.map(b=>b.end));
  for(const opening of S.openings.filter(o=>String(o.wall)===String(wall.id)&&(o.sill||0)<=0&&o.height>0)){
   const a=opening.s-opening.width/2,b=opening.s+opening.width/2;
   if(a<0||b>geom.L){unresolved=true;continue;}
   apertures.push([[a,lo],[b,lo],[b,hi],[a,hi]].map(([s,d])=>({x:geom.a.x+geom.ux*s-geom.uz*d,z:geom.a.z+geom.uz*s+geom.ux*d})));
  }
 }
 const voids=(S.slabOpenings||[]).map(openingCorners);
 signature=key;cached=projectAreaReport({rooms,wallSolids,voids,apertures,metadata:S.roomMeta,unresolved});return cached;
}

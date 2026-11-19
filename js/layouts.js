import { S } from "./state.js";
import { detectRooms, wallGeom, wallPointAt } from "./geometry.js";
import { normalizeWallKind } from "./wall_curves.js";
import { canonicalPlacementItem, canonicalPlacementWall } from "./placement_resolver.js";
import { itemVSpan } from "./furniture_api.js";
import { suggestRoomLayout, checkRoomFit, fixedLayoutItem, inside, layoutWalkableRooms } from "./layout_analysis.js";
import { doorSwingBand, doorSwingPolys, swingPolysForItem } from "./swing_clearance.js";
import { openingCorners } from "./slab_openings.js";

function workspaceSnapshot() {
  const rooms = detectRooms().map(room => ({...room, wallIds:room.key.split(',')}));
  const walls = S.walls.map(wall => {
    const record = canonicalPlacementWall(wall,{wallGeom,wallPointAt,normalizeWallKind});
    if(!record)return null;
    return {...record,...record.material};
  }).filter(Boolean);
  const fixedIds=S.items.filter(i=>i.facesId!=null||i.groupId!=null||i.pinned||i.fixed||i.mep).map(i=>i.id);
  const doorSwings=S.openings.flatMap(op=>{
    const band=doorSwingBand(op);
    return doorSwingPolys(op).map(points=>({points,id:op.id,elev:band.lo,h:band.hi-band.lo}));
  });
  const itemSwings=Object.fromEntries(S.items.map(item=>[item.id,swingPolysForItem(item)
    .map(swing=>({points:swing.poly,elev:swing.band.lo,h:swing.band.hi-swing.band.lo}))]));
  const doors=S.openings.filter(o=>o.type!=="window"&&!(o.sill>0)).map(o=>{
    const wall=S.walls.find(w=>w.id===o.wall);
    return wall?{...o,center:wallPointAt(wall,o.s)}:null;
  }).filter(Boolean);
  const access={doors,width:60,voids:(S.slabOpenings||[]).map(openingCorners)};
  return {scene:{rooms,walls,items:S.items.map(item=>canonicalPlacementItem(item,{itemVSpan}))},access,fixedIds,doorSwings,itemSwings};
}

const pose = it => ({id:it.id,x:it.x,z:it.z,rot:it.rot||0});
const signature = snapshot => JSON.stringify([snapshot,S.items.map(i=>[i.id,i.groupId,i.facesId])]);

export function generateLayouts() {
  const snapshot=workspaceSnapshot(), original=snapshot.scene.items.map(pose);
  const revision=signature(snapshot), roomOptions=[];
  let issues=0;
  for(const room of snapshot.scene.rooms){
    const local={...snapshot,roomKey:room.key};
    issues+=checkRoomFit(local).length;
    const result=suggestRoomLayout(local,'rearrange');
    if(result.ok)roomOptions.push(result.options);
  }
  const candidates=[{id:'original',name:'Current layout',items:original,score:Math.max(0,100-issues*12),revision}];
  const seen=new Set([JSON.stringify(original)]);
  for(let i=0;i<3&&candidates.length<3;i++){
    const alternatives=new Map(roomOptions.flatMap(options=>options[i%options.length].moves.map(it=>[it.id,pose(it)])));
    const items=original.map(it=>alternatives.get(it.id)||it),key=JSON.stringify(items);
    if(seen.has(key))continue;
    seen.add(key);
    const updated=snapshot.scene.items.map((it,index)=>({...it,...items[index]}));
    const before=layoutWalkableRooms(snapshot),after=before?.length?layoutWalkableRooms(snapshot,updated):null;
    if(before?.some(key=>!after?.includes(key)))continue;
    const count=snapshot.scene.rooms.reduce((n,room)=>n+checkRoomFit({...snapshot,roomKey:room.key},updated).length,0);
    candidates.push({id:'alternative-'+(i+1),name:'Room layout '+(i+1),items,score:Math.max(0,100-count*12),revision});
  }
  return candidates.sort((a,b)=>b.score-a.score);
}

export function applyLayout(candidate) {
  if(!candidate)return false;
  const snapshot=workspaceSnapshot();
  if(candidate.revision!==signature(snapshot))return false;
  const byId=new Map(candidate.items.map(p=>[p.id,p]));
  for(const it of S.items){
    const p=byId.get(it.id);
    if(p&&!fixedLayoutItem(it,snapshot)&&snapshot.scene.rooms.some(room=>inside(it,room.pts))){
      Object.assign(it,{x:p.x,z:p.z,rot:p.rot});
    }
  }
  S.dirty3D=true;
  return true;
}

import {segmentCross} from "./room_graph.js";
import {placementBatchFitsScene} from './placement_resolver.js';
import {LAYOUT_ACCESS} from './layout_preferences.js';

export function footprint(item,front=0){
 const angle=(item.rot||0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),hw=item.w/2,hd=item.d/2;
 const corners=front?[[-hw,hd],[hw,hd],[hw,hd+front],[-hw,hd+front]]:[[-hw,-hd],[hw,-hd],[hw,hd],[-hw,hd]];
 return corners.map(([x,z])=>({x:item.x+x*c-z*s,z:item.z+x*s+z*c}));
}
export function convexOverlap(a,b){
 for(const p of [a,b])for(let i=0;i<p.length;i++){
  const q=p[(i+1)%p.length],axis={x:q.z-p[i].z,z:p[i].x-q.x};
  const aa=a.map(v=>v.x*axis.x+v.z*axis.z),bb=b.map(v=>v.x*axis.x+v.z*axis.z);
  if(Math.min(...aa)>=Math.max(...bb)-1e-6||Math.min(...bb)>=Math.max(...aa)-1e-6)return false;
 }
 return true;
}
export function inside(point,poly){
 let value=false;
 for(let i=0,j=poly.length-1;i<poly.length;j=i++){
  const a=poly[i],b=poly[j];
  if((a.z>point.z)!==(b.z>point.z)&&point.x<(b.x-a.x)*(point.z-a.z)/(b.z-a.z)+a.x)value=!value;
 }
 return value;
}
function contained(poly,room){return poly.every(p=>inside(p,room.pts))&&!poly.some((a,i)=>room.pts.some((c,j)=>segmentCross(a,poly[(i+1)%poly.length],c,room.pts[(j+1)%room.pts.length],1e-6)));}
function hitsWalls(poly,scene){
 return scene.walls.some(w=>w.physical!==false&&w.points.slice(1).some((b,i)=>{const a=w.points[i],length=Math.hypot(b.x-a.x,b.z-a.z)||1,dx=-(b.z-a.z)/length*w.thickness/2,dz=(b.x-a.x)/length*w.thickness/2;return convexOverlap(poly,[{x:a.x+dx,z:a.z+dz},{x:b.x+dx,z:b.z+dz},{x:b.x-dx,z:b.z-dz},{x:a.x-dx,z:a.z-dz}]);}));
}
function operatingZones(item,snapshot){
 const original=snapshot.scene.items.find(i=>i.id===item.id),source=original?snapshot.itemSwings?.[item.id]:snapshot.swingTemplates?.[item.type];
 if(!source)return [];
 const angle=((item.rot||0)-(original?.rot||0))*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),x=original?.x||0,z=original?.z||0;
 return source.map(zone=>({...zone,points:zone.points.map(p=>({x:item.x+(p.x-x)*c-(p.z-z)*s,z:item.z+(p.x-x)*s+(p.z-z)*c}))}));
}
const DEPTH=LAYOUT_ACCESS;
function vertical(a,b){return Math.min((a.elev||0)+(a.h||200),(b.elev||0)+(b.h||200))>Math.max(a.elev||0,b.elev||0)+1;}
export function checkRoomFit(snapshot,items=snapshot.scene.items){
 const room=snapshot.scene.rooms.find(r=>r.key===snapshot.roomKey),issues=[];
 if(!room)return [{kind:'missing-room'}];
 const scene={...snapshot.scene,items};
 for(const item of items.filter(i=>inside(i,room.pts))){
  if(item.blocksPlacement===false)continue;
  if(!placementBatchFitsScene(scene,[{itemId:item.id,x:item.x,z:item.z,rot:item.rot}]))issues.push({kind:'physical',itemId:item.id});
  const polygon=footprint(item),depth=snapshot.preferences?.[item.type]??DEPTH[item.type]??60;
  const zone=footprint(item,depth);
  if(depth>0&&(!contained(zone,room)||hitsWalls(zone,scene)||items.some(other=>other.id!==item.id&&other.blocksPlacement!==false&&vertical(item,other)&&convexOverlap(zone,footprint(other)))))issues.push({kind:'access',itemId:item.id});
  for(const operation of operatingZones(item,snapshot))if(!contained(operation.points,room)||hitsWalls(operation.points,scene)||items.some(other=>other.id!==item.id&&other.blocksPlacement!==false&&vertical(operation,other)&&convexOverlap(operation.points,footprint(other))))issues.push({kind:'operation',itemId:item.id});
  for(const swing of snapshot.doorSwings||[])if(vertical(item,swing)&&convexOverlap(polygon,swing.points))issues.push({kind:'door',itemId:item.id,openingId:swing.id});
 }
 return issues;
}
function fixed(item,snapshot){return item.locked||item.hold||item.on!=null||snapshot.fixedIds?.includes(item.id)||snapshot.scene.items.some(i=>i.on===item.id);}
export function suggestRoomLayout(snapshot,mode){
 const room=snapshot.scene.rooms.find(r=>r.key===snapshot.roomKey);
 if(!room)return {ok:false,reason:'missing-room'};
 const existing=snapshot.scene.items,targets=mode==='rearrange'?existing.filter(i=>inside(i,room.pts)&&!fixed(i,snapshot)&&i.blocksPlacement!==false):[];
 const additions=mode==='furnish'?(snapshot.required||[]).map((item,index)=>({...item,id:'new-'+index,rot:0,x:room.cx,z:room.cz,elev:0,blocksPlacement:true})):[];
 const optional=mode==='furnish'?(snapshot.optional||[]).map((item,index)=>({...item,id:'optional-'+index,optional:true,rot:0,x:room.cx,z:room.cz,elev:0,blocksPlacement:true})):[];
 const movable=[...targets,...additions].sort((a,b)=>b.w*b.d-a.w*a.d).concat(optional);
 if(!movable.length)return {ok:false,reason:'no-items'};
 const options=[],blockedItems=new Set();
 for(let variant=0;variant<3;variant++){
  let placed=existing.filter(item=>!targets.includes(item)).map(i=>({...i})),failed=null;
  const moves=[],omitted=[];
  for(const item of movable){
   const candidates=[];
   const xs=room.pts.map(p=>p.x),zs=room.pts.map(p=>p.z);
   const stride=Math.max(10,snapshot.searchStep||20);
   for(const rot of [0,90,180,270])for(let x=Math.min(...xs)+stride;x<Math.max(...xs);x+=stride)for(let z=Math.min(...zs)+stride;z<Math.max(...zs);z+=stride){
    if(!inside({x,z},room.pts))continue;
    const move={...item,x,z,rot},scene={...snapshot.scene,items:[...placed,move]};
    if(!placementBatchFitsScene(scene,[{itemId:item.id,x,z,rot}]))continue;
    const trial=checkRoomFit(snapshot,scene.items);
    if(trial.some(issue=>issue.itemId===item.id||['access','operation'].includes(issue.kind)))continue;
    const change=Math.hypot(x-item.x,z-item.z)+(rot===(item.rot||0)?0:30);
    const preference=variant===1?x+z:variant===2?-x+z:change;
    candidates.push({item:move,score:preference});
   }
   candidates.sort((a,b)=>a.score-b.score);
   if(!candidates.length){if(item.optional){omitted.push(item.type);continue;}blockedItems.add(item.type);failed=item.id;break;}
   const best=candidates[0].item;placed.push(best);moves.push(best);
  }
  if(!failed&&moves.length&&!checkRoomFit(snapshot,placed).length){
   const signature=JSON.stringify(moves.map(i=>[i.id,i.x,i.z,i.rot]));
   if(!options.some(o=>o.signature===signature))options.push({signature,moves,omitted,issues:[]});
  }
 }
 return options.length?{ok:true,options}:{ok:false,reason:'no-fit',blockedItems:blockedItems.size?[...blockedItems]:[...new Set(movable.map(i=>i.type))]};
}

export function suggestRoomSize(snapshot){
 const bounds=snapshot.interiorBounds,room=snapshot.scene.rooms.find(r=>r.key===snapshot.roomKey);
 if(!bounds||!room)return {ok:false,reason:'size-geometry'};
 const items=snapshot.scene.items.filter(i=>inside(i,room.pts));
 if(!items.length)return {ok:false,reason:'no-items'};
 const points=items.flatMap(item=>[...footprint(item),...footprint(item,snapshot.preferences?.[item.type]??DEPTH[item.type]??60)]);
 if(points.some(p=>p.x<bounds.x0||p.z<bounds.z0))return {ok:false,reason:'size-edge'};
 const width=Math.max(...points.map(p=>p.x))-bounds.x0+5,depth=Math.max(...points.map(p=>p.z))-bounds.z0+5;
 return {ok:true,size:{width:Math.max(20,width),depth:Math.max(20,depth)}};
}

import {segmentCross} from "./room_graph.js";
import {itemCorners, placementBatchFitsScene, polygonsOverlap} from './placement_resolver.js';
import {LAYOUT_ACCESS} from './layout_preferences.js';
import {FRONT_CLEARANCE, OVERLAY, WALL_BACKED} from './apartment_rules.js';
import {layoutSetId, setLayoutSetId} from './group_frame.js';
import {reviewAccess} from './access_review.js';

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
function vertical(a,b){return Math.min((a.elev||0)+(a.h??200),(b.elev||0)+(b.h??200))>Math.max(a.elev||0,b.elev||0)+0.1;}
function accessDepth(snapshot,item){return snapshot.preferences?.[item.type]??DEPTH[item.type]??FRONT_CLEARANCE[item.type]??0;}
function bedSideAccess(item,room,scene){
 const a=(item.rot||0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
 const head=Math.min(item.d,45), d=item.d-head;
 return [-1,1].some(side=>{
   const x=side*(item.w/2+30), z=head/2;
   const zone=footprint({...item,w:60,d,x:item.x+c*x-s*z,z:item.z+s*x+c*z});
   return contained(zone,room)&&!hitsWalls(zone,scene)&&!scene.items.some(other=>other.id!==item.id&&
     other.blocksPlacement!==false&&vertical(item,other)&&convexOverlap(zone,footprint(other)));
 });
}
export function checkRoomFit(snapshot,items=snapshot.scene.items){
 const room=snapshot.scene.rooms.find(r=>r.key===snapshot.roomKey),issues=[];
 if(!room)return [{kind:'missing-room'}];
 const scene={...snapshot.scene,items};
 for(const item of items.filter(i=>inside(i,room.pts))){
  if(item.blocksPlacement===false)continue;
  if(!placementBatchFitsScene(scene,[{itemId:item.id,x:item.x,z:item.z,rot:item.rot}]))issues.push({kind:'physical',itemId:item.id});
  const polygon=footprint(item),depth=accessDepth(snapshot,item);
  if((['bed','bunk'].includes(item.type)&&!bedSideAccess(item,room,scene))||
    (snapshot.access?.voids||[]).some(voidPoly=>convexOverlap(polygon,voidPoly)))issues.push({kind:'access',itemId:item.id});
  const zone=footprint(item,depth);
  if(depth>0&&(!contained(zone,room)||hitsWalls(zone,scene)||items.some(other=>other.id!==item.id&&other.blocksPlacement!==false&&vertical(item,other)&&!usesPartnerSpace(item,other)&&convexOverlap(zone,footprint(other)))))issues.push({kind:'access',itemId:item.id});
  for(const operation of operatingZones(item,snapshot))if(!contained(operation.points,room)||hitsWalls(operation.points,scene)||items.some(other=>other.id!==item.id&&other.blocksPlacement!==false&&vertical(operation,other)&&convexOverlap(operation.points,footprint(other))))issues.push({kind:'operation',itemId:item.id});
  for(const swing of snapshot.doorSwings||[])if(vertical(item,swing)&&convexOverlap(polygon,swing.points))issues.push({kind:'door',itemId:item.id,openingId:swing.id});
 }
 return issues;
}

// Apartment generation uses rectangular bays and orthogonal furniture. The
// reusable floor grid tests the same 60 cm traveler as the whole-plan review,
// restricted to the room being furnished. A door's cells are where that
// traveler can enter the room clear of both jambs and the finished wall.
export function roomDoorGrid(floor, doors, origin) {
 const step=10,radius=30;
 const first=(lo,axis)=>origin[axis]+5+step*Math.ceil((lo+radius-origin[axis]-5)/step);
 const x0=first(floor.x0,'x'),z0=first(floor.z0,'z');
 const nx=1+Math.floor((floor.x1-radius-x0)/step),nz=1+Math.floor((floor.z1-radius-z0)/step);
 if(nx<1||nz<1||doors.length<2)return null;
 const portals=doors.map(door=>{
   const alongX=Math.abs(door.tx)>.5,cellIds=[];
   for(let iz=0;iz<nz;iz++)for(let ix=0;ix<nx;ix++){
     const dx=x0+ix*step-door.x,dz=z0+iz*step-door.z;
     if(Math.abs(alongX?dx:dz)+radius>door.width/2+.001)continue;
     if(Math.abs(alongX?dz:dx)<=radius+door.thickness/2+step)cellIds.push(iz*nx+ix);
   }
   return cellIds;
 });
 return {x0,z0,nx,nz,step,radius,portals};
}

export function doorRoutesClear(grid, boxes) {
 if(!grid)return true;
 const {x0,z0,nx,nz,step,radius,portals}=grid,state=new Uint8Array(nx*nz);
 for(const b of boxes){
   const ix0=Math.max(0,Math.floor((b.x0-radius-x0)/step)),ix1=Math.min(nx-1,Math.ceil((b.x1+radius-x0)/step));
   const iz0=Math.max(0,Math.floor((b.z0-radius-z0)/step)),iz1=Math.min(nz-1,Math.ceil((b.z1+radius-z0)/step));
   for(let iz=iz0;iz<=iz1;iz++)for(let ix=ix0;ix<=ix1;ix++){
     const x=x0+ix*step,z=z0+iz*step;
     const dx=Math.max(b.x0-x,x-b.x1,0),dz=Math.max(b.z0-z,z-b.z1,0);
     if(dx*dx+dz*dz<radius*radius-1e-5)state[iz*nx+ix]=1;
   }
 }
 const start=portals[0].find(i=>!state[i]);
 if(start==null)return false;
 const queue=[start];state[start]=2;
 for(let i=0;i<queue.length;i++){
   const at=queue[i],col=at%nx;
   for(const next of [col>0?at-1:-1,col<nx-1?at+1:-1,at-nx,at+nx]){
     if(state[next]!==0)continue;
     state[next]=2;queue.push(next);
   }
 }
 return portals.every(portal=>portal.some(i=>state[i]===2));
}
export function fixedLayoutItem(item,snapshot){
 return item.locked||item.hold||item.rotUser||item.pinned||item.fixed||item.mep||item.groupId!=null||item.facesId!=null||
   item.configuration?.layoutSetId!=null||item.layoutSetId!=null||OVERLAY.has(item.type)||(item.elev||0)>0||
   item.on!=null||snapshot.fixedIds?.includes(item.id)||snapshot.scene.items.some(i=>i.on!=null&&String(i.on)===String(item.id));
}
export function layoutWalkableRooms(snapshot,items=snapshot.scene.items){
 const access=snapshot.access;
 if(!access?.doors?.length)return null;
 const entranceId=access.entranceId??access.doors.find(door=>
   snapshot.scene.rooms.filter(room=>(room.wallIds||String(room.key).split(',')).map(String).includes(String(door.wall))).length===1
 )?.id;
 if(entranceId==null)return null;
 return reviewAccess({...access,scene:{...snapshot.scene,items},entranceId}).walkable;
}
export function suggestRoomLayout(snapshot,mode){
 const room=snapshot.scene.rooms.find(r=>r.key===snapshot.roomKey);
 if(!room)return {ok:false,reason:'missing-room'};
 const existing=snapshot.scene.items,targets=mode==='rearrange'?existing.filter(i=>inside(i,room.pts)&&!fixedLayoutItem(i,snapshot)&&i.blocksPlacement!==false):[];
 const additions=mode==='furnish'?(snapshot.required||[]).map((item,index)=>({...item,id:'new-'+index,rot:0,x:room.cx,z:room.cz,elev:0,blocksPlacement:true})):[];
 const optional=mode==='furnish'?(snapshot.optional||[]).map((item,index)=>({...item,id:'optional-'+index,optional:true,rot:0,x:room.cx,z:room.cz,elev:0,blocksPlacement:true})):[];
 const dining=additions.some(i=>i.type==='table'||i.type==='roundTable');
 const chair=additions.find(i=>i.type==='chair'),stand=additions.find(i=>i.type==='nightstand');
 if(dining&&chair){
  for(let n=additions.filter(i=>i.type==='chair').length;n<4;n++)optional.push({...chair,id:'optional-dining-'+n,optional:true});
 }
 if(stand&&additions.some(i=>i.type==='bed')&&additions.filter(i=>i.type==='nightstand').length===1){
  optional.push({...stand,id:'optional-bedside',optional:true});
 }
 const movable=[...targets,...additions].sort((a,b)=>placementOrder(a)-placementOrder(b)||b.w*b.d-a.w*a.d).concat(optional);
 if(!movable.length)return {ok:false,reason:'no-items'};
 const options=[],blockedItems=new Set();
 const fixed=existing.filter(item=>!targets.includes(item));
 if(checkRoomFit(snapshot,fixed).length)return {ok:false,reason:'no-fit',blockedItems:[...new Set(movable.map(i=>i.type))]};
 const previousWalkable=snapshot.previousWalkable??layoutWalkableRooms(snapshot);
 for(let variant=0;variant<3;variant++){
  let placed=[...fixed],failed=null;
  const moves=[],omitted=[];
  for(const item of movable){
   const candidates=candidatePoses(item,room,snapshot,placed.filter(p=>inside(p,room.pts)))
    .filter(p=>inside(p,room.pts)).map(p=>({...p,score:variant===1?p.x+p.z:variant===2?-p.x+p.z:
      Math.hypot(p.x-item.x,p.z-item.z)+(p.rot===(item.rot||0)?0:30)}))
    .sort((a,b)=>a.priority-b.priority||(a.priority===0?(a.error||0)-(b.error||0):0)||
      (a.score+2*(a.error||0))-(b.score+2*(b.error||0)));
   let best=null;
   for(const {x,z,rot} of candidates){
    const move={...item,x,z,rot};
    if(!checkRoomFit(snapshot,[...placed,move]).length){best=move;break;}
   }
   if(!best){if(item.optional){omitted.push(item.type);continue;}blockedItems.add(item.type);failed=item.id;break;}
   placed.push(best);moves.push(best);
  }
  if(!failed&&moves.length&&!checkRoomFit(snapshot,placed).length){
   if(previousWalkable?.length){
    const walkable=layoutWalkableRooms(snapshot,placed)||[];
    if(previousWalkable.some(key=>!walkable.includes(key)))continue;
   }
   const signature=JSON.stringify(moves.map(i=>[i.id,i.x,i.z,i.rot]));
   if(!options.some(o=>o.signature===signature))options.push({signature,moves,omitted,issues:[]});
  }
 }
 const leastOmitted=Math.min(...options.map(o=>o.omitted.length));
 return options.length?{ok:true,options:options.filter(o=>o.omitted.length===leastOmitted)}:
   {ok:false,reason:'no-fit',blockedItems:blockedItems.size?[...blockedItems]:[...new Set(movable.map(i=>i.type))]};
}

export function suggestRoomSize(snapshot){
 const bounds=snapshot.interiorBounds,room=snapshot.scene.rooms.find(r=>r.key===snapshot.roomKey);
 if(!bounds||!room)return {ok:false,reason:'size-geometry'};
 const items=snapshot.scene.items.filter(i=>inside(i,room.pts));
 if(!items.length)return {ok:false,reason:'no-items'};
 const points=items.flatMap(item=>[...footprint(item),...footprint(item,accessDepth(snapshot,item))]);
 if(points.some(p=>p.x<bounds.x0||p.z<bounds.z0))return {ok:false,reason:'size-edge'};
 const width=Math.max(...points.map(p=>p.x))-bounds.x0+5,depth=Math.max(...points.map(p=>p.z))-bounds.z0+5;
 return {ok:true,size:{width:Math.max(20,width),depth:Math.max(20,depth)}};
}

const kitchen = new Set(['base','fridge','sink','cooktop','oven','dishwasher']);
const seats = new Set(['chair','officeChair','barstool']);
const seatHosts = new Set(['desk','table','roundTable','island']);
const screens = new Set(['tv','tvWall','tvunit']);

function placementOrder(item) {
  if(item.type==='fridge')return -1;
  return seats.has(item.type) || item.type === 'nightstand' || item.type === 'coffee' ? 1 : 0;
}

// A chair pulled up to a desk/table occupies its partner's access strip.
function usesPartnerSpace(a, b) {
  if(a.type==='sofa'&&b.type==='coffee')return true;
  const [seat, host] = seats.has(a.type) ? [a,b] : [b,a];
  if (!seats.has(seat.type) || !seatHosts.has(host.type)) return false;
  const angle = seat.rot * Math.PI/180, dx = host.x-seat.x, dz = host.z-seat.z;
  return -Math.sin(angle)*dx + Math.cos(angle)*dz >= 0.9*Math.hypot(dx,dz);
}

function localPose(host, x, z, turn) {
  const angle = (host.rot || 0)*Math.PI/180, c=Math.cos(angle), s=Math.sin(angle);
  return {x:host.x+x*c-z*s, z:host.z+x*s+z*c, rot:((host.rot||0)+turn+360)%360};
}

function facesViewPartner(item, placed) {
  if(item.type!=='sofa'&&!screens.has(item.type))return true;
  const targets=placed.filter(p=>item.type==='sofa'?screens.has(p.type):p.type==='sofa');
  if(!targets.length)return true;
  return targets.some(other=>{
    const sofa=item.type==='sofa'?item:other,screen=sofa===item?other:item;
    const dx=screen.x-sofa.x,dz=screen.z-sofa.z,distance=Math.hypot(dx,dz);
    const a=(sofa.rot||0)*Math.PI/180,b=(screen.rot||0)*Math.PI/180;
    if(!distance||(-Math.sin(a)*dx+Math.cos(a)*dz)/distance<.94||
      (Math.sin(b)*dx-Math.cos(b)*dz)/distance<.87)return false;
    const x=dx/distance,z=dz/distance;
    const start=sofa.d/2,end=distance-screen.d/2;
    const sightline=[[start,-16],[end,-16],[end,16],[start,16]]
      .map(([d,w])=>({x:sofa.x+x*d-z*w,z:sofa.z+z*d+x*w}));
    return !placed.some(p=>p!==other&&p.blocksPlacement!==false&&(p.elev||0)<120&&
      (p.elev||0)+(p.h||0)>85&&polygonsOverlap(sightline,itemCorners(p,p.x,p.z,p.rot)));
  });
}

function partnerPoses(item, placed) {
  const poses=[];
  for (const host of placed) {
    const front=(host.d+item.d)/2;
    if (seats.has(item.type) && seatHosts.has(host.type)) {
      poses.push(localPose(host,0,front+12,180));
      if (host.type!=='desk') {
        const side=(host.w+item.d)/2+12;
        poses.push(localPose(host,0,-front-12,0),localPose(host,side,0,90),localPose(host,-side,0,270));
      }
    } else if (item.type==='nightstand' && ['bed','bunk'].includes(host.type)) {
      const side=(host.w+item.w)/2+3, z=(item.d-host.d)/2;
      poses.push(localPose(host,side,z,0),localPose(host,-side,z,0));
    } else if (item.type==='coffee' && host.type==='sofa') {
      poses.push(localPose(host,0,front+40,0));
    } else if (kitchen.has(item.type) && kitchen.has(host.type)) {
      const side=(host.w+item.w)/2, z=(item.d-host.d)/2;
      poses.push(localPose(host,side,z,0),localPose(host,-side,z,0));
    }
  }
  return poses;
}

// item.place creates one independent record per unit. Record the suggested
// set only for a batch of newly created pieces actually laid out together.
export function linkFurnishedSets(items, allocateId) {
  const fresh=items.filter(i=>i.groupId==null&&layoutSetId(i)==null);
  for(const host of fresh.filter(i=>seatHosts.has(i.type)||i.type==='bed')){
    const partners=fresh.filter(i=>{
      if(layoutSetId(i)!=null||(!seats.has(i.type)&&i.type!=='nightstand'))return false;
      return partnerPoses(i,[host]).some(p=>Math.hypot(p.x-i.x,p.z-i.z)<4&&
        Math.cos((p.rot-(i.rot||0))*Math.PI/180)>0.99);
    });
    if(partners.length){
      const id=allocateId();
      for(const member of [host,...partners])setLayoutSetId(member,id);
    }
  }
  const remaining=new Set(fresh.filter(it=>kitchen.has(it.type)));
  while(remaining.size){
    const first=remaining.values().next().value,run=[first];
    remaining.delete(first);
    for(const unit of run){
      const edges=itemCorners({...unit,w:unit.w+5,d:unit.d+5},unit.x,unit.z,unit.rot);
      for(const next of remaining){
        if(!polygonsOverlap(edges,itemCorners(next,next.x,next.z,next.rot)))continue;
        remaining.delete(next);run.push(next);
      }
    }
    if(run.length>1){
      const id=allocateId();
      for(const member of run)setLayoutSetId(member,id);
    }
  }
}

// item.place commits a 2 cm coordinate grid. Try the four surrounding grid
// points, starting with the closest, so preview and applied clearances agree.
function gridNeighbors(pose) {
  const baseX=Math.floor(pose.x/2)*2, baseZ=Math.floor(pose.z/2)*2;
  return [0,2].flatMap(dx=>[0,2].map(dz=>({...pose,x:baseX+dx,z:baseZ+dz,error:Math.hypot(baseX+dx-pose.x,baseZ+dz-pose.z)})))
    .sort((a,b)=>Math.hypot(a.x-pose.x,a.z-pose.z)-Math.hypot(b.x-pose.x,b.z-pose.z));
}

function wallPoses(item, walls, stride) {
  const poses=[];
  for (const wall of walls) {
    const solids=[];
    for(let i=1;i<wall.points.length;i++){
      const a=wall.points[i-1], b=wall.points[i], length=Math.hypot(b.x-a.x,b.z-a.z);
      if(!length)continue;
      const nx=-(b.z-a.z)/length,nz=(b.x-a.x)/length,half=wall.thickness/2;
      solids.push([a,b].map(p=>({x:p.x+nx*half,z:p.z+nz*half}))
        .concat([b,a].map(p=>({x:p.x-nx*half,z:p.z-nz*half}))));
    }
    for (let i=1;i<wall.points.length;i++) {
      const a=wall.points[i-1], b=wall.points[i], dx=b.x-a.x, dz=b.z-a.z, length=Math.hypot(dx,dz);
      if (!length || (!wall.curved && item.w>length)) continue;
      const count=Math.max(1,Math.ceil(length/stride));
      for (const side of [-1,1]) {
        const nx=-dz/length*side,nz=dx/length*side,rot=(Math.atan2(-nx,nz)*180/Math.PI+360)%360;
        for(let j=0;j<=count;j++) {
          const cx=a.x+dx*j/count,cz=a.z+dz*j/count;
          // A wide flat back on a curved wall touches at the center or at an
          // outer corner. Test all the wall's chords, including adjacent ones.
          for(let extra=0;extra<=(wall.curved?item.w/2:0);extra+=1){
            const offset=(wall.thickness+item.d)/2+extra;
            const pose={x:cx+nx*offset,z:cz+nz*offset,rot};
            if(wall.curved && solids.some(p=>polygonsOverlap(itemCorners(item,pose.x,pose.z,rot),p)))continue;
            poses.push(pose);break;
          }
        }
      }
    }
  }
  return poses;
}

function candidatePoses(item, room, snapshot, placed) {
  const stride=Math.max(10,snapshot.searchStep||20);
  const partners=partnerPoses(item,placed);
  const run=placed.filter(p=>kitchen.has(p.type));
  const fridge=run.find(p=>p.type==='fridge');
  const preferred=partners.flatMap(gridNeighbors).map(p=>{
    const fridgeEnd=kitchen.has(item.type)&&fridge&&run.length>1&&Math.hypot(p.x-fridge.x,p.z-fridge.z)<
      (item.w+fridge.w)/2+4;
    return {...p,priority:fridgeEnd?1:0};
  });
  if(partners.length && !kitchen.has(item.type))return preferred;
  const wallIds=new Set(room.wallIds?.map(String));
  const walls=snapshot.scene.walls.filter(w=>w.physical!==false&&(!wallIds.size||wallIds.has(String(w.id))));
  if(walls.length && (WALL_BACKED.has(item.type)||screens.has(item.type)||item.type==='sofa'||item.type==='washer')){
    return preferred.concat(wallPoses(item,walls,stride).flatMap(gridNeighbors).map(p=>({...p,priority:2})))
      .filter(p=>facesViewPartner({...item,...p},placed));
  }
  const xs=room.pts.map(p=>p.x),zs=room.pts.map(p=>p.z);
  const poses=[...preferred];
  for (const rot of [0,90,180,270]) {
    for(let x=Math.min(...xs)+stride;x<Math.max(...xs);x+=stride){
      for(let z=Math.min(...zs)+stride;z<Math.max(...zs);z+=stride){
        poses.push({x:Math.round(x/2)*2,z:Math.round(z/2)*2,rot,priority:1});
      }
    }
  }
  return poses.filter(p=>facesViewPartner({...item,...p},placed));
}

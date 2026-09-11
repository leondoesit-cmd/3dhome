import {inside,footprint} from './layout_analysis.js';
function distance(p,a,b){const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);}
function nearPolygon(p,poly,radius){return inside(p,poly)||poly.some((a,i)=>distance(p,a,poly[(i+1)%poly.length])<radius-1e-6);}
export function reviewAccess(snapshot){
 const {scene,doors=[],entranceId,width=60,bodyHeight=180}=snapshot,rooms=scene.rooms;
 const links=doors.map(door=>({...door,rooms:rooms.filter(r=>(r.wallIds||String(r.key).split(',')).map(String).includes(String(door.wall))).map(r=>r.key)}));
 const entrance=links.find(door=>String(door.id)===String(entranceId));
 const connected=new Set(entrance?.rooms||[]),pending=[...connected];
 while(pending.length){const key=pending.pop();for(const door of links.filter(d=>d.rooms.includes(key)))for(const other of door.rooms)if(!connected.has(other)){connected.add(other);pending.push(other);}}
 const base={links:links.map(d=>({id:d.id,rooms:d.rooms})),disconnected:entrance?rooms.filter(r=>!connected.has(r.key)).map(r=>r.key):[],missingEntrance:!entrance,width};
 if(!entrance||!rooms.length)return {...base,walkable:null};
 const xs=rooms.flatMap(r=>r.pts.map(p=>p.x)),zs=rooms.flatMap(r=>r.pts.map(p=>p.z)),x0=Math.min(...xs),z0=Math.min(...zs),step=10;
 const columns=Math.ceil((Math.max(...xs)-x0)/step),rows=Math.ceil((Math.max(...zs)-z0)/step);
 if(columns*rows>120000)return {...base,walkable:null,reason:'too-large'};
 const radius=width/2,itemPolys=scene.items.filter(i=>i.blocksPlacement!==false&&(i.elev||0)<bodyHeight).map(i=>footprint(i)),voids=snapshot.voids||[];
 const free=p=>{
  if(!rooms.some(r=>inside(p,r.pts)))return false;
  if(snapshot.canOccupy)return snapshot.canOccupy(p);
  if([...itemPolys,...voids].some(poly=>nearPolygon(p,poly,radius)))return false;
  for(const wall of scene.walls){
   if(wall.physical===false)continue;let station=0;
   for(let i=1;i<wall.points.length;i++){
    const a=wall.points[i-1],b=wall.points[i],length=Math.hypot(b.x-a.x,b.z-a.z);
    if(distance(p,a,b)<(wall.thickness||10)/2+radius){
     const s=station+((p.x-a.x)*(b.x-a.x)+(p.z-a.z)*(b.z-a.z))/(length||1);
     if(!doors.some(d=>String(d.wall)===String(wall.id)&&Math.abs(s-d.s)+radius<d.width/2+1e-6))return false;
    }
    station+=length;
   }
  }
  return true;
 };
 const cells=new Map();
 for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
  const p={x:x0+(col+.5)*step,z:z0+(row+.5)*step};if(free(p))cells.set(row*columns+col,p);
 }
 const starts=[...cells].filter(([,p])=>entrance.rooms.some(key=>inside(p,rooms.find(r=>r.key===key).pts))).sort((a,b)=>Math.hypot(a[1].x-entrance.center.x,a[1].z-entrance.center.z)-Math.hypot(b[1].x-entrance.center.x,b[1].z-entrance.center.z));
 const start=starts[0];if(!start||Math.hypot(start[1].x-entrance.center.x,start[1].z-entrance.center.z)>width+step)return {...base,walkable:[],blockedItems:[],reason:'blocked-entrance'};
 const reached=new Set([start[0]]),queue=[start[0]];
 for(let i=0;i<queue.length;i++){
  const key=queue[i],p=cells.get(key),col=key%columns;
  for(const next of [col>0?key-1:-1,col<columns-1?key+1:-1,key-columns,key+columns]){
   const q=cells.get(next);if(!q||reached.has(next)||!free({x:(p.x+q.x)/2,z:(p.z+q.z)/2}))continue;
   reached.add(next);queue.push(next);
  }
 }
 const reachedPoints=[...reached].map(key=>cells.get(key));
 const walkable=rooms.filter(room=>reachedPoints.some(p=>inside(p,room.pts))).map(r=>r.key);
 const blockedItems=scene.items.filter(i=>i.blocksPlacement!==false&&(i.elev||0)<bodyHeight).filter(item=>{
  const angle=(item.rot||0)*Math.PI/180,p={x:item.x-Math.sin(angle)*(item.d/2+radius+step),z:item.z+Math.cos(angle)*(item.d/2+radius+step)};
  return !reachedPoints.some(q=>Math.hypot(q.x-p.x,q.z-p.z)<step*1.5);
 }).map(i=>i.id);
 return {...base,walkable,blockedItems,step,reachedPoints};
}

import {validLoop} from './room_shapes.js';
import {polygonBooleanArea} from './polygon_area.js';
function corridorPolygon(path,width){
 const half=width/2,normals=path.slice(1).map((p,i)=>{const a=path[i],length=Math.hypot(p.x-a.x,p.z-a.z);return {x:-(p.z-a.z)/length,z:(p.x-a.x)/length};});
 const side=sign=>path.map((p,i)=>{
  const a=normals[Math.max(0,i-1)],b=normals[Math.min(normals.length-1,i)];
  const same=i===0||i===path.length-1;
  return {x:p.x+sign*half*(same?a.x:a.x+b.x),z:p.z+sign*half*(same?a.z:a.z+b.z)};
 });
 return [...side(1),...side(-1).reverse()];
}
export function routeCorridor({permitted,start,end,rooms=[],obstacles=[],width=90,thickness=10,step=20,connections=null}){
 if(!validLoop(permitted)||![start?.x,start?.z,end?.x,end?.z,width,thickness,step].every(Number.isFinite)||width<40||thickness<=0||step<5)return {ok:false,reason:'invalid-boundary'};
 const blocked=[...rooms.map(room=>room.pts),...obstacles];
 const radius=(width+thickness)/2,x0=start.x-Math.ceil((start.x-Math.min(...permitted.map(p=>p.x)))/step)*step,z0=start.z-Math.ceil((start.z-Math.min(...permitted.map(p=>p.z)))/step)*step,x1=Math.max(...permitted.map(p=>p.x)),z1=Math.max(...permitted.map(p=>p.z));
 const cols=Math.ceil((x1-x0)/step)+1,rows=Math.ceil((z1-z0)/step)+1;if(cols*rows>80000)return {ok:false,reason:'too-large'};
 const point=(x,z)=>({x:x0+x*step,z:z0+z*step});
 const index=p=>({x:Math.round((p.x-x0)/step),z:Math.round((p.z-z0)/step)}),a=index(start),b=index(end);
 const availability=new Map();
 const free=(x,z)=>{
  if(x<0||z<0||x>=cols||z>=rows)return false;
  const cell=z*cols+x;if(availability.has(cell))return availability.get(cell);
  const p=point(x,z),box=[{x:p.x-radius,z:p.z-radius},{x:p.x+radius,z:p.z-radius},{x:p.x+radius,z:p.z+radius},{x:p.x-radius,z:p.z+radius}];
  const valid=polygonBooleanArea([[box],[permitted]],s=>s[0]&&!s[1])<=1e-6&&!blocked.some(polygon=>polygonBooleanArea([[box],[polygon]],s=>s[0]&&s[1])>1e-6);
  availability.set(cell,valid);return valid;
 };
 if(!free(a.x,a.z)||!free(b.x,b.z))return {ok:false,reason:'blocked-endpoint'};
 const key=(x,z,dir)=>(z*cols+x)*5+dir,startKey=key(a.x,a.z,4),queue=[{...a,cost:0,dir:4}],best=new Map([[startKey,0]]),parents=new Map();
 const directions=[[1,0],[-1,0],[0,1],[0,-1]];let reached=null;
 while(queue.length){
  queue.sort((a,b)=>b.cost-a.cost);const cur=queue.pop(),id=key(cur.x,cur.z,cur.dir);
  if(cur.cost!==best.get(id))continue;
  if(cur.x===b.x&&cur.z===b.z){reached=id;break;}
  for(let dir=0;dir<directions.length;dir++){
   const [dx,dz]=directions[dir],x=cur.x+dx,z=cur.z+dz;if(!free(x,z))continue;
   const cost=cur.cost+step+(cur.dir!==4&&cur.dir!==dir?step*.25:0),next=key(x,z,dir);
   if(cost>=(best.get(next)??Infinity))continue;best.set(next,cost);parents.set(next,id);queue.push({x,z,cost,dir});
  }
 }
 if(reached===null)return {ok:false,reason:'no-route'};
 const path=[];let id=reached;
 while(true){const position=Math.floor(id/5);path.push(point(position%cols,Math.floor(position/cols)));if(id===startKey)break;id=parents.get(id);}
 path.reverse();const simple=path.filter((p,i)=>!i||i===path.length-1||(p.x-path[i-1].x)*(path[i+1].z-p.z)!==(p.z-path[i-1].z)*(path[i+1].x-p.x));
 if(simple.length<2)return {ok:false,reason:'no-route'};
 if(connections){
  const first=connections.start,last=connections.end;
  const lead=first.normal.x?{x:simple[0].x,z:first.center.z}:{x:first.center.x,z:simple[0].z};
  const tail=last.normal.x?{x:simple.at(-1).x,z:last.center.z}:{x:last.center.x,z:simple.at(-1).z};
  simple.unshift(first.center,lead);simple.push(tail,last.center);
  for(let i=simple.length-1;i>0;i--)if(Math.hypot(simple[i].x-simple[i-1].x,simple[i].z-simple[i-1].z)<1e-6)simple.splice(i,1);
  for(let i=simple.length-2;i>0;i--)if((simple[i].x-simple[i-1].x)*(simple[i+1].z-simple[i].z)===(simple[i].z-simple[i-1].z)*(simple[i+1].x-simple[i].x))simple.splice(i,1);
 }
 const polygon=corridorPolygon(simple,width+thickness);
 if(!validLoop(polygon)||polygonBooleanArea([[polygon],[permitted]],s=>s[0]&&!s[1])>1e-6||blocked.some(obstacle=>polygonBooleanArea([[polygon],[obstacle]],s=>s[0]&&s[1])>1e-6))return {ok:false,reason:'no-route'};
 return {ok:true,path:simple,polygon,width,thickness};
}

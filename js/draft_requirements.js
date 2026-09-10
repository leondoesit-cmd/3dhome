import {roomPreset} from './room_presets.js';
import {validLoop} from './room_shapes.js';
import {polygonBooleanArea} from './polygon_area.js';
const rectangle=(x,z,w,d)=>[{x,z},{x:x+w,z},{x:x+w,z:z+d},{x,z:z+d}];
const unique=values=>[...new Set(values)].sort((a,b)=>a-b);

// Try a few deterministic orderings and boundary/room-edge alignments. This is
// a bounded candidate search, not a proof of infeasibility or an optimal plan.
export function requirementDraft(requirements,boundary,origin={x:0,z:0}){
 if(!Array.isArray(requirements)||!requirements.length||requirements.length>24)return {ok:false,reason:'requirements-count'};
 const sizes=requirements.map((entry,index)=>{
  const preset=roomPreset(entry.type);return preset?{...entry,index,width:entry.width??preset.w,depth:entry.depth??preset.d,floor:preset.floor,name:entry.name||preset.name}:null;
 });
 if(sizes.some(r=>!r||![r.width,r.depth].every(n=>Number.isFinite(n)&&n>=20&&n<=10000)))return {ok:false,reason:'requirements-size'};
 const total=sizes.reduce((sum,r)=>sum+(r.width+10)*(r.depth+10),0);
 const width=Math.max(...sizes.map(r=>r.width+20),Math.sqrt(total)*1.5);
 const permitted=boundary||rectangle(origin.x,origin.z,width,sizes.reduce((sum,r)=>sum+r.depth+20,0));
 if(!validLoop(permitted))return {ok:false,reason:'requirements-boundary'};
 const x0=Math.min(...permitted.map(p=>p.x))+5,z0=Math.min(...permitted.map(p=>p.z))+5;
 const maxx=Math.max(...permitted.map(p=>p.x))-5,maxz=Math.max(...permitted.map(p=>p.z))-5;
 const orders=[sizes,[...sizes].sort((a,b)=>b.width*b.depth-a.width*a.depth||a.index-b.index),[...sizes].sort((a,b)=>Math.max(b.width,b.depth)-Math.max(a.width,a.depth)||a.index-b.index)];
 let attempts=0,lastUnplaced=sizes[0].name;
 for(const order of orders){
  const placed=[];let failed=false;
  for(const entry of order){
   const w=entry.width+10,d=entry.depth+10;
   const xs=unique([x0,maxx-w,...permitted.flatMap(p=>[p.x+5,p.x-5-w]),...placed.flatMap(r=>[r.x1,r.x0-w])]).filter(x=>x>=x0-1e-6&&x+w<=maxx+1e-6);
   const zs=unique([z0,maxz-d,...permitted.flatMap(p=>[p.z+5,p.z-5-d]),...placed.flatMap(r=>[r.z1,r.z0-d])]).filter(z=>z>=z0-1e-6&&z+d<=maxz+1e-6);
   let found=null;
   for(const z of zs){
    for(const x of xs){
     if(++attempts>6000)return {ok:false,reason:'requirements-search-limit',unplaced:entry.name};
     // All candidates are axis-aligned rectangles. Reject overlaps cheaply
     // before checking material containment in the possibly concave outline.
     if(placed.some(r=>Math.max(0,Math.min(x+w,r.x1)-Math.max(x,r.x0))*Math.max(0,Math.min(z+d,r.z1)-Math.max(z,r.z0))>1e-6))continue;
     const outer=rectangle(x-5,z-5,w+10,d+10);
     if(polygonBooleanArea([[outer],[permitted]],s=>s[0]&&!s[1])>1e-6)continue;
     found={name:entry.name,roomType:entry.type,floor:entry.floor,...(entry.id?{checklistId:entry.id}:{}),x0:x,z0:z,x1:x+w,z1:z+d,index:entry.index};break;
    }
    if(found)break;
   }
   if(!found){failed=true;lastUnplaced=entry.name;break;}
   placed.push(found);
  }
  if(!failed){
   const rooms=placed.sort((a,b)=>a.index-b.index).map(({index,...room})=>room);
   return {ok:true,layout:{w:Math.max(...rooms.map(r=>r.x1))-x0,d:Math.max(...rooms.map(r=>r.z1))-z0,rooms,doors:[],windows:[]}};
  }
 }
 return {ok:false,reason:'requirements-no-fit',unplaced:lastUnplaced};
}

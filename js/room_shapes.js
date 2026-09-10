import {segmentCross} from './room_graph.js';
export function shapePoints(type,{x=0,z=0,width=400,depth=400,arm=150,points=[]}={}){
 let polygon;
 if(type==='custom')polygon=points.map(p=>({x:Number(p.x),z:Number(p.z)}));
 else{
  if(![x,z,width,depth,arm].every(Number.isFinite)||width<20||depth<20||arm<20||arm>=Math.min(width,depth)/2)return null;
  const w=width,d=depth,a=arm;
  const coords=type==='L'?[[0,0],[w,0],[w,a],[a,a],[a,d],[0,d]]:
   type==='T'?[[0,0],[w,0],[w,a],[(w+a)/2,a],[(w+a)/2,d],[(w-a)/2,d],[(w-a)/2,a],[0,a]]:
   type==='U'?[[0,0],[w,0],[w,d],[w-a,d],[w-a,a],[a,a],[a,d],[0,d]]:null;
  if(!coords)return null;polygon=coords.map(([px,pz])=>({x:x+px,z:z+pz}));
 }
 return validLoop(polygon)?polygon:null;
}
export function validLoop(points){
 if(!Array.isArray(points)||points.length<3||points.length>64||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.z)))return false;
 for(let i=0;i<points.length;i++){
  const a=points[i],b=points[(i+1)%points.length];if(Math.hypot(a.x-b.x,a.z-b.z)<20)return false;
  for(let j=i+1;j<points.length;j++){
   if(j===i+1||(i===0&&j===points.length-1))continue;
   const c=points[j],d=points[(j+1)%points.length];
   if(segmentCross(a,b,c,d,1e-6))return false;
   const on=(p,q,r)=>Math.abs((q.x-p.x)*(r.z-p.z)-(q.z-p.z)*(r.x-p.x))<1e-6&&r.x>=Math.min(p.x,q.x)-1e-6&&r.x<=Math.max(p.x,q.x)+1e-6&&r.z>=Math.min(p.z,q.z)-1e-6&&r.z<=Math.max(p.z,q.z)+1e-6;
   if(on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b))return false;
  }
 }
 const area=points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p.x*q.z-q.x*p.z;},0)/2;
 return Math.abs(area)>=400;
}
export function shapeBoundarySignature(state,key){
 const walls=state.walls.filter(w=>String(key).split(',').includes(String(w.id)));
 const nodes=[...new Set(walls.flatMap(w=>[w.a,w.b]))].map(i=>state.nodes[i]);
 const x=Math.min(...nodes.map(n=>n.x)),z=Math.min(...nodes.map(n=>n.z));
 return JSON.stringify(walls.map(w=>[w.id,state.nodes[w.a].x-x,state.nodes[w.a].z-z,state.nodes[w.b].x-x,state.nodes[w.b].z-z,w.geometry||null]));
}

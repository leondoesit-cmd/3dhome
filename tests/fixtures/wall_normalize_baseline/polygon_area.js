// Exact integration of piecewise-linear polygon unions and differences.
// Every vertex and edge intersection partitions x into slabs with linear bounds.
const EPS=1e-9;
function edges(polygons){return polygons.flatMap(p=>p.map((a,i)=>[a,p[(i+1)%p.length]]));}
function union(intervals){
 const result=[];
 for(const next of intervals.sort((a,b)=>a[0]-b[0])){
  const last=result.at(-1);
  if(last&&next[0]<=last[1]+EPS)last[1]=Math.max(last[1],next[1]);else result.push(next.slice());
 }
 return result;
}
function spans(polygons,x){
 return union(polygons.flatMap(p=>{
  const crossings=[];
  for(let i=0;i<p.length;i++){
   const a=p[i],b=p[(i+1)%p.length];
   if(x>Math.min(a.x,b.x)&&x<Math.max(a.x,b.x))crossings.push(a.z+(b.z-a.z)*(x-a.x)/(b.x-a.x));
  }
  crossings.sort((a,b)=>a-b);const result=[];
  for(let i=0;i+1<crossings.length;i+=2)result.push([crossings[i],crossings[i+1]]);
  return result;
 }));
}
function length(positive,negative,x){
 const cuts=spans(negative,x);let sum=0;
 for(const [lo,hi] of spans(positive,x)){
  let amount=hi-lo;
  for(const [a,b] of cuts)amount-=Math.max(0,Math.min(hi,b)-Math.max(lo,a));
  sum+=Math.max(0,amount);
 }
 return sum;
}
export function polygonDifferenceArea(positive,negative=[]){
 const polygons=[...positive,...negative];
 if(polygons.some(p=>!Array.isArray(p)||p.length<3||p.some(v=>!Number.isFinite(v.x)||!Number.isFinite(v.z))))return null;
 const segments=edges(polygons),xs=polygons.flatMap(p=>p.map(v=>v.x));
 for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++){
  const [a,b]=segments[i],[c,d]=segments[j];
  const ux=b.x-a.x,uz=b.z-a.z,vx=d.x-c.x,vz=d.z-c.z,den=ux*vz-uz*vx;
  if(Math.abs(den)<EPS)continue;
  const t=((c.x-a.x)*vz-(c.z-a.z)*vx)/den,u=((c.x-a.x)*uz-(c.z-a.z)*ux)/den;
  if(t>EPS&&t<1-EPS&&u>EPS&&u<1-EPS)xs.push(a.x+t*ux);
 }
 xs.sort((a,b)=>a-b);let area=0;
 for(let i=1;i<xs.length;i++){
  const width=xs[i]-xs[i-1];if(width<EPS)continue;
  // Midpoint integrates a linear length exactly, without vertex ambiguity.
  area+=width*length(positive,negative,(xs[i]+xs[i-1])/2);
 }
 return Math.max(0,area);
}

export function polygonBooleanArea(groups,accept){
 const polygons=groups.flat();
 if(polygons.some(p=>!Array.isArray(p)||p.length<3||p.some(v=>!Number.isFinite(v.x)||!Number.isFinite(v.z))))return null;
 const segments=edges(polygons),xs=polygons.flatMap(p=>p.map(v=>v.x));
 for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++){
  const [a,b]=segments[i],[c,d]=segments[j];
  const ux=b.x-a.x,uz=b.z-a.z,vx=d.x-c.x,vz=d.z-c.z,den=ux*vz-uz*vx;
  if(Math.abs(den)<EPS)continue;
  const t=((c.x-a.x)*vz-(c.z-a.z)*vx)/den,u=((c.x-a.x)*uz-(c.z-a.z)*ux)/den;
  if(t>EPS&&t<1-EPS&&u>EPS&&u<1-EPS)xs.push(a.x+t*ux);
 }
 xs.sort((a,b)=>a-b);let area=0;
 for(let i=1;i<xs.length;i++){
  const width=xs[i]-xs[i-1];if(width<EPS)continue;
  const ranges=groups.map(p=>spans(p,(xs[i]+xs[i-1])/2));
  const zs=ranges.flat(2).sort((a,b)=>a-b);let total=0;
  for(let j=1;j<zs.length;j++){
   const mid=(zs[j]+zs[j-1])/2;
   if(accept(ranges.map(r=>r.some(([a,b])=>mid>a&&mid<b))))total+=zs[j]-zs[j-1];
  }
  area+=width*total;
 }
 return Math.max(0,area);
}

// Exact integration of piecewise-linear polygon unions and differences.
// Every vertex and edge intersection partitions x into slabs with linear bounds.
const EPS=1e-9;
function edges(polygons){return polygons.flatMap(p=>p.map((a,i)=>[a,p[(i+1)%p.length]]));}
function partitionXs(polygons){
 const segments=edges(polygons),xs=polygons.flatMap(p=>p.map(v=>v.x));
 const sorted=segments.map(([a,b],index)=>({index,lo:Math.min(a.x,b.x),hi:Math.max(a.x,b.x),z0:Math.min(a.z,b.z),z1:Math.max(a.z,b.z)})).sort((a,b)=>a.lo-b.lo);
 // Only edges with overlapping bounds can intersect. Keep original operand
 // order so the intersection arithmetic is identical to the all-pairs version.
 for(let i=0;i<sorted.length;i++)for(let j=i+1;j<sorted.length&&sorted[j].lo<=sorted[i].hi;j++){
  const first=sorted[i],second=sorted[j];
  if(first.z1<second.z0||second.z1<first.z0)continue;
  const [a,b]=segments[Math.min(first.index,second.index)],[c,d]=segments[Math.max(first.index,second.index)];
  const ux=b.x-a.x,uz=b.z-a.z,vx=d.x-c.x,vz=d.z-c.z,den=ux*vz-uz*vx;
  if(Math.abs(den)<EPS)continue;
  const t=((c.x-a.x)*vz-(c.z-a.z)*vx)/den,u=((c.x-a.x)*uz-(c.z-a.z)*ux)/den;
  if(t>EPS&&t<1-EPS&&u>EPS&&u<1-EPS)xs.push(a.x+t*ux);
 }
 return xs.sort((a,b)=>a-b);
}
function spanSweep(polygons){
 const pending=polygons.map(p=>({p,lo:Math.min(...p.map(v=>v.x)),hi:Math.max(...p.map(v=>v.x))})).sort((a,b)=>a.lo-b.lo);
 const active=new Set();let cursor=0;
 return x=>{
  while(cursor<pending.length&&pending[cursor].lo<x)active.add(pending[cursor++]);
  for(const entry of active)if(entry.hi<=x)active.delete(entry);
  return spans(Array.from(active,entry=>entry.p),x);
 };
}
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
function length(positive,cuts){
 let sum=0;
 for(const [lo,hi] of positive){
  let amount=hi-lo;
  for(const [a,b] of cuts)amount-=Math.max(0,Math.min(hi,b)-Math.max(lo,a));
  sum+=Math.max(0,amount);
 }
 return sum;
}
export function polygonDifferenceArea(positive,negative=[]){
 const polygons=[...positive,...negative];
 if(polygons.some(p=>!Array.isArray(p)||p.length<3||p.some(v=>!Number.isFinite(v.x)||!Number.isFinite(v.z))))return null;
 const xs=partitionXs(polygons),positives=spanSweep(positive),negatives=spanSweep(negative);let area=0;
 for(let i=1;i<xs.length;i++){
  const width=xs[i]-xs[i-1];if(width<EPS)continue;
  // Midpoint integrates a linear length exactly, without vertex ambiguity.
  const x=(xs[i]+xs[i-1])/2;
  area+=width*length(positives(x),negatives(x));
 }
 return Math.max(0,area);
}

export function polygonBooleanArea(groups,accept){
 const polygons=groups.flat();
 if(polygons.some(p=>!Array.isArray(p)||p.length<3||p.some(v=>!Number.isFinite(v.x)||!Number.isFinite(v.z))))return null;
 const xs=partitionXs(polygons),sweeps=groups.map(spanSweep);let area=0;
 for(let i=1;i<xs.length;i++){
  const width=xs[i]-xs[i-1];if(width<EPS)continue;
  const ranges=sweeps.map(sweep=>sweep((xs[i]+xs[i-1])/2)),cursors=ranges.map(()=>0);
  const zs=ranges.flat(2).sort((a,b)=>a-b);let total=0;
  for(let j=1;j<zs.length;j++){
   const mid=(zs[j]+zs[j-1])/2;
   if(accept(ranges.map((r,k)=>{
    while(cursors[k]<r.length&&r[cursors[k]][1]<=mid)cursors[k]++;
    const interval=r[cursors[k]];return !!interval&&mid>interval[0]&&mid<interval[1];
   })))total+=zs[j]-zs[j-1];
  }
  area+=width*total;
 }
 return Math.max(0,area);
}

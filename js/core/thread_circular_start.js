// Resolve a full circular boundary to one cylindrical host in current native
// topology. No nearest-face matching or world-axis default is permitted.
const xyz=['x','y','z'];
const finite=p=>p && xyz.every(k=>Number.isFinite(p[k]));
const dot=(a,b)=>xyz.reduce((n,k)=>n+a[k]*b[k],0);
const delta=(a,b)=>Object.fromEntries(xyz.map(k=>[k,a[k]-b[k]]));
const unit=p=>{if(!finite(p))return null;const n=Math.hypot(p.x,p.y,p.z);return n>1e-12?Object.fromEntries(xyz.map(k=>[k,p[k]/n])):null;};
export function threadPlacementFromCircularEdge(edge,topology) {
  const d=edge?.descriptor,a=unit(d?.axis),r=d?.radius;
  if(edge?.kind!=='edge'||d?.curve!=='circle'||!finite(d.origin)||!a||!Number.isFinite(r)||r<=0||!Number.isFinite(d.measure)||Math.abs(d.measure-2*Math.PI*r)>Math.max(1e-6,r*1e-5))throw new Error('Select a full circular edge for the thread start');
  const tol=Math.max(1e-6,r*1e-5),matches=[],seen=new Set();
  for(const face of topology || []) {
    const c=face?.descriptor,axis=unit(c?.axis),range=c?.axisRange,base=c?.referenceOrigin;
    if(face?.kind!=='face'||c?.surface!=='cylinder'||!axis||!finite(base)||!Number.isFinite(c.radius)||!Array.isArray(range)||range.length!==2||!range.every(Number.isFinite)||Math.abs(c.radius-r)>tol||Math.abs(dot(a,axis))<1-1e-8)continue;
    const v=delta(d.origin,base),station=dot(v,axis),radial=Math.hypot(...xyz.map(k=>v[k]-station*axis[k]));
    const lo=Math.min(...range),hi=Math.max(...range);
    if(radial>tol||hi-lo<=tol)continue;
    const near=Math.abs(station-lo)<=tol,far=Math.abs(station-hi)<=tol;
    if(!near&&!far)continue;
    const key=JSON.stringify([face.ownerFeatureId,face.persistentId]);if(seen.has(key))continue;seen.add(key);
    matches.push({face,edge,origin:{...d.origin},axis:Object.fromEntries(xyz.map(k=>[k,axis[k]*(near?1:-1)||0]))});
  }
  if(matches.length!==1)throw new Error(matches.length?'The circular edge has ambiguous cylindrical support':'The circular edge is not a boundary of a current cylindrical face');
  return matches[0];
}

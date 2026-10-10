const finitePoint=p=>p && ['x','y','z'].every(k=>Number.isFinite(p[k]));
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;

/** A native cone's side-on silhouette generator and its parallel axial datum.
 * These arms are derived from the conical face, never its arbitrary seam. */
export function coneDraftAngle(face,basis,side=1) {
  const d=face?.descriptor,origin=d?.referenceOrigin,axis=d?.axis,range=d?.axisRange;
  if(face?.kind!=='face' || d?.surface!=='cone' || !finitePoint(origin) || !finitePoint(axis)
    || !basis || !finitePoint(basis.right) || !finitePoint(basis.up) || !finitePoint(basis.forward)
    || !Array.isArray(range) || range.length!==2 || !range.every(Number.isFinite)
    || !Number.isFinite(d.radius) || !Number.isFinite(d.angle))return null;
  const norm=Math.hypot(axis.x,axis.y,axis.z),angle=Math.abs(d.angle);
  if(Math.abs(norm-1)>1e-6 || angle<1e-8 || angle>=Math.PI/2-1e-6
    || Math.abs(dot(axis,basis.forward))>1e-6)return null;
  const ends=range.map(t=>({t,r:d.radius+t*Math.tan(d.angle)}));
  if(ends.some(e=>e.r<0) || Math.abs(ends[0].t-ends[1].t)<1e-7)return null;
  ends.sort((a,b)=>b.r-a.r);
  const [large,small]=ends,span=Math.abs(large.t-small.t);
  const project=p=>({u:dot(p,basis.right),v:dot(p,basis.up)});
  const centre=project(origin),a={u:dot(axis,basis.right),v:dot(axis,basis.up)};
  let radial={u:-a.v,v:a.u};
  if(radial.u<0 || Math.abs(radial.u)<1e-9 && radial.v<0)radial={u:-radial.u,v:-radial.v};
  const sign=side===-1?-1:1;
  const point=e=>({u:centre.u+a.u*e.t+radial.u*sign*e.r,v:centre.v+a.v*e.t+radial.v*sign*e.r});
  const vertex=point(large),toward=Math.sign(small.t-large.t);
  return {refs:[point(small),vertex,{u:vertex.u+a.u*toward*span,v:vertex.v+a.v*toward*span}],degrees:angle*180/Math.PI};
}

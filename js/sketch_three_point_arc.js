// Endpoints first, then a point on the desired sweep. Return the endpoint
// order used by the sketch solver: counter-clockwise around the centre.
export function threePointArc(start, end, through) {
  const bx=end.u-start.u, by=end.v-start.v;
  const cx=through.u-start.u, cy=through.v-start.v;
  const determinant=2*(bx*cy-by*cx);
  const scale=Math.max(bx*bx+by*by,cx*cx+cy*cy);
  if (!Number.isFinite(scale) || scale === 0 || Math.abs(determinant)<scale*1e-10) return null;
  const b2=bx*bx+by*by, c2=cx*cx+cy*cy;
  const centre={u:start.u+(cy*b2-by*c2)/determinant,v:start.v+(bx*c2-cx*b2)/determinant};
  const angle=p=>Math.atan2(p.v-centre.v,p.u-centre.u);
  const tau=2*Math.PI, sweep=(angle(end)-angle(start)+tau)%tau;
  const middle=(angle(through)-angle(start)+tau)%tau;
  return {centre,start:middle<=sweep?start:end,end:middle<=sweep?end:start,
    radius:Math.hypot(start.u-centre.u,start.v-centre.v)};
}

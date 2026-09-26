// One finite display axis per coaxial group of exact cylindrical/conical faces.
export function temporaryAxes(topology) {
 const groups=[];
 for(const face of topology || []){
  const d=face.descriptor;
  if(face.kind!=='face'||!['cylinder','cone'].includes(d?.surface)||!d.axis||!d.referenceOrigin||!d.axisRange)continue;
  const length=Math.hypot(d.axis.x,d.axis.y,d.axis.z);
  if(!(length>1e-9))continue;
  let n={x:d.axis.x/length,y:d.axis.y/length,z:d.axis.z/length};
  const lead=[n.x,n.y,n.z].find(v=>Math.abs(v)>1e-8);
  if(lead<0)n={x:-n.x,y:-n.y,z:-n.z};
  const dot=p=>p.x*n.x+p.y*n.y+p.z*n.z;
  const t=dot(d.referenceOrigin),origin={x:d.referenceOrigin.x-n.x*t,y:d.referenceOrigin.y-n.y*t,z:d.referenceOrigin.z-n.z*t};
  const direction=dot(d.axis),ends=d.axisRange.map(v=>t+v*direction);
  let group=groups.find(g=>Math.hypot(g.origin.x-origin.x,g.origin.y-origin.y,g.origin.z-origin.z)<1e-6&&Math.hypot(g.n.x-n.x,g.n.y-n.y,g.n.z-n.z)<1e-6);
  if(!group){group={origin,n,min:Infinity,max:-Infinity};groups.push(group);}
  group.min=Math.min(group.min,...ends);group.max=Math.max(group.max,...ends);
 }
 return groups.map(g=>{
  const pad=Math.max((g.max-g.min)*.15,.02);
  const at=t=>({x:g.origin.x+g.n.x*t,y:g.origin.y+g.n.y*t,z:g.origin.z+g.n.z*t});
  return {from:at(g.min-pad),to:at(g.max+pad)};
 });
}

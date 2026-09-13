// Offset an open meridian toward the material (the left side of its winding).
// Concave turns have circular joins; convex turns intersect adjacent offsets.
export function shellMeridian(points, thickness, join='round') {
 if(points.length<2 || !(Math.abs(thickness)>1e-9))throw new Error('Shell meridian is empty');
 const cross=(a,b)=>a.u*b.v-a.v*b.u,sub=(a,b)=>({u:a.u-b.u,v:a.v-b.v});
 const lines=points.slice(1).map((b,i)=>{const a=points[i],d=sub(b,a),length=Math.hypot(d.u,d.v);if(length<1e-9)throw new Error('Shell meridian has a zero-length edge');const n={u:-d.v/length*thickness,v:d.u/length*thickness};return {d,n,a:{u:a.u+n.u,v:a.v+n.v},b:{u:b.u+n.u,v:b.v+n.v}};});
 // Openings remain on their selected disk planes, rather than moving with
 // the axial component of a conical wall's normal.
 for(const [line,end,v] of [[lines[0],'a',points[0].v],[lines.at(-1),'b',points.at(-1).v]]){
  if(Math.abs(line.d.v)<1e-9)throw new Error('Shell opening is tangent to the wall');
  line[end]={u:line.a.u+(v-line.a.v)*line.d.u/line.d.v,v};
 }
 const connectors=[];
 for(let i=1;i<lines.length;i++){
  const before=lines[i-1],after=lines[i],turn=cross(before.d,after.d);
  if(Math.abs(turn)<1e-12){if(before.d.u*after.d.u+before.d.v*after.d.v<0)throw new Error('Shell meridian doubles back');continue;}
  if(join==='round' && turn*thickness<0){
   const n={u:before.n.u+after.n.u,v:before.n.v+after.n.v},length=Math.hypot(n.u,n.v),center=points[i];
   connectors[i]={type:'arc',from:before.b,to:after.a,mid:{u:center.u+n.u/length*Math.abs(thickness),v:center.v+n.v/length*Math.abs(thickness)}};
  }else{
   const t=cross(sub(after.a,before.a),after.d)/turn,at={u:before.a.u+t*before.d.u,v:before.a.v+t*before.d.v};before.b=at;after.a=at;
  }
 }
 const offset=[];lines.forEach((line,i)=>{if(connectors[i])offset.push(connectors[i]);offset.push({type:'line',from:line.a,to:line.b});});
 if(offset.some(s=>s.from.u<=0 || s.to.u<=0))throw new Error('Shell thickness reaches the revolution axis');
 const result=points.slice(1).map((p,i)=>({type:'line',from:points[i],to:p}));
 result.push({type:'line',from:points.at(-1),to:offset.at(-1).to});
 result.push(...offset.slice().reverse().map(s=>({...s,from:s.to,to:s.from})));
 result.push({type:'line',from:offset[0].from,to:points[0]});return result;
}

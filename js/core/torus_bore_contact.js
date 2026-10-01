// Finite bore/rim contact for a circular wire loop crossing a cylindrical bore.
// The tube's exact toroidal section is evaluated at both ends of the face and
// at the loop centre plane when it lies between them. Surface tangency alone
// uses an infinite cylinder and can seat a curved wire through the bore wall.
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const unit=v=>{const l=Math.hypot(v.x,v.y,v.z);return {x:v.x/l,y:v.y/l,z:v.z/l};};
export function torusBoreSectionContact(torus,cylinder){
 if(!cylinder.referenceOrigin || !Array.isArray(cylinder.axisRange) || cylinder.axisRange.length!==2)return null;
 const rawNormal=unit(torus.axis),axis=unit(cylinder.axis),parallel=dot(rawNormal,axis);
 if(Math.abs(parallel)>1e-3 || !(torus.majorRadius>torus.minorRadius) || !(cylinder.radius>torus.minorRadius))return null;
 // Small pose probes around the perpendicular solution must remain smooth.
 const n=unit({x:rawNormal.x-axis.x*parallel,y:rawNormal.y-axis.y*parallel,z:rawNormal.z-axis.z*parallel});
 let vertical=unit({x:axis.y*n.z-axis.z*n.y,y:axis.z*n.x-axis.x*n.z,z:axis.x*n.y-axis.y*n.x});
 const delta={x:cylinder.origin.x-torus.origin.x,y:cylinder.origin.y-torus.origin.y,z:cylinder.origin.z-torus.origin.z};
 if(dot(delta,vertical)<0)vertical={x:-vertical.x,y:-vertical.y,z:-vertical.z};
 const h=dot(delta,n),dy=dot(delta,vertical);
 const base={x:cylinder.referenceOrigin.x-torus.origin.x,y:cylinder.referenceOrigin.y-torus.origin.y,z:cylinder.referenceOrigin.z-torus.origin.z};
 const ends=cylinder.axisRange.map(v=>dot(base,axis)+v).sort((a,b)=>a-b);
 if(Math.max(...ends.map(Math.abs))>=torus.majorRadius-torus.minorRadius)return null;
 const sections=[...ends];if(ends[0]<0 && ends[1]>0)sections.push(0);
 let best=null;
 for(const z of sections){
  const at=angle=>{
   const x=torus.minorRadius*Math.cos(angle),r=torus.majorRadius+torus.minorRadius*Math.sin(angle);
   const y=Math.sqrt(r*r-z*z),dx=x-h,oy=y-dy;
   return {distance:Math.hypot(dx,oy),radial:{x:n.x*dx+vertical.x*oy,y:n.y*dx+vertical.y*oy,z:n.z*dx+vertical.z*oy}};
  };
  const step=2*Math.PI/64;let angle=0,peak=at(0);
  for(let i=1;i<64;i++){const p=at(i*step);if(p.distance>peak.distance){peak=p;angle=i*step;}}
  let lo=angle-step,hi=angle+step;const ratio=(Math.sqrt(5)-1)/2;
  let a=hi-ratio*(hi-lo),b=lo+ratio*(hi-lo),fa=at(a),fb=at(b);
  for(let i=0;i<48;i++){
   if(fa.distance>fb.distance){hi=b;b=a;fb=fa;a=hi-ratio*(hi-lo);fa=at(a);}
   else{lo=a;a=b;fa=fb;b=lo+ratio*(hi-lo);fb=at(b);}
  }
  peak=at((lo+hi)/2);if(!best || peak.distance>best.distance)best=peak;
 }
 return {distance:best.distance,direction:unit(best.radial)};
}

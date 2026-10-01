export function sketchGeometryBounds(sketch) {
  const points=new Map((sketch?.points || []).map(point=>[point.id,point]));let bounds=null;
  const span=(x,y)=>{if(!Number.isFinite(x)||!Number.isFinite(y))return;bounds=bounds?{u0:Math.min(bounds.u0,x),u1:Math.max(bounds.u1,x),v0:Math.min(bounds.v0,y),v1:Math.max(bounds.v1,y)}:{u0:x,u1:x,v0:y,v1:y};};
  for(const point of points.values())span(point.x,point.y);
  for(const entity of sketch?.entities || []){
    const center=points.get(entity.c ?? entity.center);if(!center)continue;
    if(entity.type==='circle'){const r=Math.abs(Number(entity.r));span(center.x-r,center.y-r);span(center.x+r,center.y+r);}
    if(entity.type==='ellipse'){
      const angle=Number(entity.rot)||0,rx=Number(entity.rx),ry=Number(entity.ry),x=Math.hypot(rx*Math.cos(angle),ry*Math.sin(angle)),y=Math.hypot(rx*Math.sin(angle),ry*Math.cos(angle));
      span(center.x-x,center.y-y);span(center.x+x,center.y+y);
    }
    if(entity.type==='arc'){
      const a=points.get(entity.a),b=points.get(entity.b);if(!a||!b)continue;
      const r=Math.hypot(a.x-center.x,a.y-center.y),start=Math.atan2(a.y-center.y,a.x-center.x),end=Math.atan2(b.y-center.y,b.x-center.x),tau=2*Math.PI,sweep=(end-start+tau)%tau;
      for(const angle of [0,Math.PI/2,Math.PI,3*Math.PI/2])if((angle-start+tau)%tau<=sweep+1e-8)span(center.x+r*Math.cos(angle),center.y+r*Math.sin(angle));
    }
  }
  return bounds;
}

export function planeBoundsFit(bounds,frame,width,height,fov=45,margin=40,zoom=1) {
  const center={x:(bounds.x0+bounds.x1)/2,y:(bounds.y0+bounds.y1)/2,z:(bounds.z0+bounds.z1)/2};
  let halfWidth=0,halfHeight=0,halfDepth=0;
  for(const x of [bounds.x0,bounds.x1])for(const y of [bounds.y0,bounds.y1])for(const z of [bounds.z0,bounds.z1]){
    const delta={x:x-center.x,y:y-center.y,z:z-center.z},dot=axis=>Math.abs(delta.x*axis.x+delta.y*axis.y+delta.z*axis.z);
    halfWidth=Math.max(halfWidth,dot(frame.xAxis));halfHeight=Math.max(halfHeight,dot(frame.yAxis));halfDepth=Math.max(halfDepth,dot(frame.normal));
  }
  const w=Math.max(1,width),h=Math.max(1,height),tan=Math.tan(fov*Math.PI/360)/Math.max(.01,zoom);
  const distance=Math.max(halfWidth/(tan*w/h*Math.max(.1,1-2*margin/w)),halfHeight/(tan*Math.max(.1,1-2*margin/h)))+halfDepth;
  return {distance:Math.max(.01,distance),center};
}

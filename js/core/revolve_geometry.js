// Legacy meridians use u=radius and v=axial distance. Match the viewport lathe:
// angle zero is +Z (Y axis), +Z (X axis), or +Y (Z axis).
export function revolveInterval(part) {
  const degrees=Number(part.angle ?? 360);
  if(!Number.isFinite(degrees)||degrees<=0||degrees>360)throw new Error("Revolution angle must be greater than zero and at most 360 degrees");
  const span=degrees*Math.PI/180;
  const start=part.symmetric?-span/2:part.direction==="reverse"?-span:0;
  return {start,span,end:start+span};
}
export function revolvePlacement(part, radial, height, other) {
  const x=Number(part.x)||0,y=Number(part.y)||0,z=Number(part.z)||0;
  if(part.axis==="x")return {x:x+height,y:y+radial,z:z+other};
  if(part.axis==="z")return {x:x+radial,y:y+other,z:z+height};
  return {x:x+radial,y:y+height,z:z+other};
}
export function revolvePoint(part, point, angle) {
  return revolvePlacement(part,Math.abs(point.u)*Math.sin(angle),point.v,Math.abs(point.u)*Math.cos(angle));
}
export function revolveBounds(part) {
  const {start,end}=revolveInterval(part),angles=[start,end];
  for(let a=Math.ceil(start/(Math.PI/2))*Math.PI/2;a<end;a+=Math.PI/2)angles.push(a);
  const bounds={x0:Infinity,y0:Infinity,z0:Infinity,x1:-Infinity,y1:-Infinity,z1:-Infinity};
  for(const p of part.pts||[])for(const a of angles){const q=revolvePoint(part,p,a);for(const key of ['x','y','z']){bounds[key+'0']=Math.min(bounds[key+'0'],q[key]);bounds[key+'1']=Math.max(bounds[key+'1'],q[key]);}}
  return bounds;
}
export function revolveRecipe(part) {
  return {radialProfile:true,axis:part.axis||"y",angle:part.angle??360,direction:part.direction,symmetric:part.symmetric,x:part.x||0,y:part.y||0,z:part.z||0,points:(part.pts||[]).map(q=>({u:Math.abs(q.u ?? q.x),v:q.v ?? q.y}))};
}

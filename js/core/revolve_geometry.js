import { framePoint } from "./frame.js";
// Legacy meridians use u=radius and v=axial distance. Match the viewport lathe:
// angle zero is +Z (Y axis), +Z (X axis), or +Y (Z axis).
export const REVOLVE_AXIS_CROSSING = "The revolve profile crosses the axis";

export function assertRevolveProfile(points) {
  let side = 0;
  for (const point of points || []) {
    const u = Number(point?.u ?? point?.x);
    if (!Number.isFinite(u) || Math.abs(u) <= 1e-9) continue;
    const sign = Math.sign(u);
    if (side && sign !== side) throw new Error(REVOLVE_AXIS_CROSSING);
    side = sign;
  }
  return side;
}

export function assertRevolveProfileFrame(points, spec) {
  if (!spec?.profileFrame) return assertRevolveProfile(points);
  const axisName = spec.axis || "y";
  const axis = axisName === "x" ? { x: 1, y: 0, z: 0 } : axisName === "z" ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
  const dropAxis = (vector) => {
    const along = (vector.x || 0) * axis.x + (vector.y || 0) * axis.y + (vector.z || 0) * axis.z;
    return { x: (vector.x || 0) - axis.x * along, y: (vector.y || 0) - axis.y * along, z: (vector.z || 0) - axis.z * along };
  };
  let radial = dropAxis(spec.profileFrame.xAxis || { x: 1, y: 0, z: 0 });
  if (Math.hypot(radial.x, radial.y, radial.z) < 1e-9) radial = dropAxis(spec.profileFrame.yAxis || { x: 0, y: 0, z: 1 });
  const radialLength = Math.hypot(radial.x, radial.y, radial.z) || 1;
  radial = { x: radial.x / radialLength, y: radial.y / radialLength, z: radial.z / radialLength };
  // The kernel revolves around the world axis through the origin. Sign of the
  // radius is the projection of that world perpendicular onto the sketch
  // radial — not the distance from the sketch origin, which is often off-axis.
  const mapped = (points || []).map((point) => {
    const world = framePoint(spec.profileFrame, Number(point.u ?? point.x) || 0, Number(point.v ?? point.y) || 0, 0);
    const along = (world.x || 0) * axis.x + (world.y || 0) * axis.y + (world.z || 0) * axis.z;
    const u = ((world.x || 0) - axis.x * along) * radial.x
      + ((world.y || 0) - axis.y * along) * radial.y
      + ((world.z || 0) - axis.z * along) * radial.z;
    return { u, v: 0 };
  });
  return assertRevolveProfile(mapped);
}

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
  assertRevolveProfile(part.pts);
  const {start,end}=revolveInterval(part),angles=[start,end];
  for(let a=Math.ceil(start/(Math.PI/2))*Math.PI/2;a<end;a+=Math.PI/2)angles.push(a);
  const bounds={x0:Infinity,y0:Infinity,z0:Infinity,x1:-Infinity,y1:-Infinity,z1:-Infinity};
  for(const p of part.pts||[])for(const a of angles){const q=revolvePoint(part,p,a);for(const key of ['x','y','z']){bounds[key+'0']=Math.min(bounds[key+'0'],q[key]);bounds[key+'1']=Math.max(bounds[key+'1'],q[key]);}}
  return bounds;
}
export function revolveRecipe(part) {
  const points=part.pts||[];
  assertRevolveProfile(points);
  return {radialProfile:true,axis:part.axis||"y",angle:part.angle??360,direction:part.direction,symmetric:part.symmetric,x:part.x||0,y:part.y||0,z:part.z||0,points:points.map(q=>({u:Math.abs(q.u ?? q.x),v:q.v ?? q.y}))};
}

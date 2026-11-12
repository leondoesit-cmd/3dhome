import { frameCross, frameDot, framePoint } from "./frame.js";
import { sketchWorldPoint } from "./swept_sources.js";
// Legacy meridians use u=radius and v=axial distance. Match the viewport lathe:
// angle zero is +Z (Y axis), +Z (X axis), or +Y (Z axis).
export const REVOLVE_AXIS_CROSSING = "The revolve profile crosses the axis";

// The owning sketch is the feature's profile sketch. IDs are opaque (and may
// themselves contain colons), so never split the entity portion of this key.
const linePrefix = "axis:line:";
export const sketchAxisReference = id => linePrefix + id;
export const isSketchAxis = reference => typeof reference === "string" && reference.startsWith(linePrefix);

export function resolveSketchAxis(sketch, reference) {
  if (!isSketchAxis(reference)) return null;
  if (sketch?.frameSpace === "world-3d" || sketch?.surface)
    throw new Error("Revolve axis and profile must share a planar sketch");
  const entity = sketch?.entities?.find(e => sketchAxisReference(e.id) === reference);
  if (!entity) throw new Error("Revolve axis line is missing from the profile sketch. Choose another line or centerline.");
  if (entity.type !== "line" || entity.projectedCurve)
    throw new Error("Revolve axis must reference a straight line or centerline in the profile sketch");
  const a = sketch.points?.find(p => p.id === entity.a), b = sketch.points?.find(p => p.id === entity.b);
  if (![a?.x, a?.y, b?.x, b?.y].every(Number.isFinite))
    throw new Error("Revolve axis is missing a valid endpoint");
  const length = Math.hypot(b.x-a.x, b.y-a.y);
  if (length < 1e-9) throw new Error("Revolve axis line has zero length");
  const du = (b.x-a.x)/length, dv = (b.y-a.y)/length;
  const origin = sketchWorldPoint(sketch, a.x, a.y);
  const direction = (u,v) => {
    const p = sketchWorldPoint(sketch, a.x+u, a.y+v);
    return {x:p.x-origin.x, y:p.y-origin.y, z:p.z-origin.z};
  };
  const axial = direction(du,dv), radial = direction(-dv,du);
  return {origin, axial, radial, tangent:frameCross(axial,radial), u:a.x, v:a.y, du, dv};
}

export function axisMeridian(axis, point) {
  const u = point.u-axis.u, v = point.v-axis.v;
  return {u:v*axis.du-u*axis.dv, v:u*axis.du+v*axis.dv};
}

// The PropertyManager keeps a newly chosen axis in references until Finish;
// params.axis can still contain the default Y axis while the preview is live.
export function revolvePreviewAxis(params, references) {
  const reference = references?.axis?.id || references?.axis;
  if (isSketchAxis(reference)) return reference;
  const chosen = typeof reference === "string" && reference.split(":")[1];
  if (["x", "y", "z"].includes(chosen)) return chosen;
  if (isSketchAxis(params?.axis)) return params.axis;
  return ["x", "y", "z"].includes(params?.axis) ? params.axis : "y";
}

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

// Extremal signed radii on a trimmed conic occur at an endpoint or where
// d(A*cos(t)+B*sin(t))/dt vanishes. Test only extrema on the authored arc.
function conicRadii(center,A,B,start=0,span=2*Math.PI) {
  const amplitude=Math.hypot(A,B);
  if(Math.abs(span)>=2*Math.PI)return [center-amplitude,center+amplitude];
  const radius=t=>center+A*Math.cos(t)+B*Math.sin(t);
  const end=start+span,low=Math.min(start,end),high=Math.max(start,end);
  const result=[radius(start),radius(end)],peak=Math.atan2(B,A);
  for(const phase of [peak,peak+Math.PI]){
    const t=phase+Math.ceil((low-phase)/(2*Math.PI))*2*Math.PI;
    if(t<=high)result.push(radius(phase));
  }
  return result;
}

function cubicRadii(values) {
  const [p,q,r,s]=values;
  const a=s-3*r+3*q-p,b=2*(r-2*q+p),c=q-p;
  const roots=Math.abs(a)<1e-14 ? (b===0?[]:[-c/b]) :
    [(-b-Math.sqrt(b*b-4*a*c))/(2*a),(-b+Math.sqrt(b*b-4*a*c))/(2*a)];
  const radii=[p,s];
  for(const t of roots)if(t>0 && t<1){
    const u=1-t;
    radii.push(u**3*p+3*u*u*t*q+3*u*t*t*r+t**3*s);
  }
  return radii;
}

export function assertSketchAxisProfile(spec) {
  if(spec.thinFeature && isStandaloneSketchAxisRevolve(spec))
    throw new Error("Thin Revolve requires a driving sketch. This copy uses a stored section.");
  const basis=spec.axisBasis, nx=spec.sketchAxisCoordinates?-basis.dv:1, ny=spec.sketchAxisCoordinates?basis.du:0;
  const signed=p=>spec.sketchAxisCoordinates?axisMeridian(basis,p).u:p.u;
  const radii=(spec.points || spec.pts).map(signed);
  const tau=2*Math.PI;
  for(const segment of spec.segments || []){
    if(segment.type==="circle"){
      const center=signed(segment.center);
      radii.push(center-segment.radius,center+segment.radius);
    }else if(segment.type==="ellipse"){
      const rot=segment.rot || 0,c=Math.cos(rot),s=Math.sin(rot);
      const extent=Math.hypot(segment.rx*(nx*c+ny*s),segment.ry*(ny*c-nx*s));
      const center=signed(segment.center);
      radii.push(center-extent,center+extent);
    }else if(segment.type==="arc"){
      const center=segment.center,angle=p=>Math.atan2(p.v-center.v,p.u-center.u);
      const start=angle(segment.from),end=(angle(segment.to)-start+tau)%tau;
      const mid=(angle(segment.mid)-start+tau)%tau;
      const span=end<1e-12?tau:mid<=end?end:end-tau;
      radii.push(...conicRadii(signed(center),nx*segment.radius,ny*segment.radius,start,span));
    }else if(segment.type==="bezier" && segment.controls.length===4){
      radii.push(...cubicRadii(segment.controls.map(signed)));
    }else if(segment.type==="kernelCurve" && ["circle","ellipse"].includes(segment.curveData?.kind)){
      const {center,x,normal,major,minor}=segment.curveData;
      const sign=Math.sign(normal.w);
      radii.push(...conicRadii(signed(center),major*(nx*x.u+ny*x.v),minor*sign*(ny*x.u-nx*x.v),
        segment.first,segment.last-segment.first));
    }else if(segment.type==="kernelCurve"){
      const kind=segment.curveData?.kind || "unknown";
      throw new Error("Sketch-axis Revolve cannot verify a projected "+kind+" curve. Use a supported sketch curve for this profile.");
    }
  }
  if(!assertRevolveProfile(radii.map(u=>({u}))))throw new Error("Revolve profile lies on the axis");
}

// A legacy mirror or pattern copy stores its own axis and section. A recipe
// that still names driving entities must resolve them even if it has a basis.
export function isStandaloneSketchAxisRevolve(params) {
  return isSketchAxis(params?.axis) && !!params.axisBasis && !params.sketchId && !params.profileEntityIds?.length;
}

export function assertStandaloneRevolve(spec) {
  const {origin,axial,radial,tangent,u,v,du,dv}=spec.axisBasis;
  const finiteVector=p=>p && [p.x,p.y,p.z].every(Number.isFinite);
  if(![origin,axial,radial,tangent].every(finiteVector) ||
     [axial,radial,tangent].some(a=>Math.abs(frameDot(a,a)-1)>1e-7) ||
     Math.abs(frameDot(axial,radial))>1e-7 || frameDot(frameCross(axial,radial),tangent)<1-1e-7)
    throw new Error("Stored revolve axis has an invalid coordinate frame");
  if(spec.sketchAxisCoordinates && (![u,v,du,dv].every(Number.isFinite) || Math.abs(Math.hypot(du,dv)-1)>1e-7))
    throw new Error("Stored revolve axis has invalid sketch coordinates");
  const points=spec.points || spec.pts;
  if(!Array.isArray(points) || points.length<3 || !points.every(p=>Number.isFinite(p?.u) && Number.isFinite(p?.v)))
    throw new Error("Stored revolve requires a finite closed profile");
  assertSketchAxisProfile(spec);
  revolveInterval(spec);
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
  if (part.axisBasis) {
    const {origin,axial,tangent,radial:out} = part.axisBasis;
    const at = key => origin[key]+height*axial[key]+radial*tangent[key]+other*out[key];
    return {x:x+at("x"),y:y+at("y"),z:z+at("z")};
  }
  if(part.axis==="x")return {x:x+height,y:y+radial,z:z+other};
  if(part.axis==="z")return {x:x+radial,y:y+other,z:z+height};
  return {x:x+radial,y:y+height,z:z+other};
}
export function revolvePoint(part, point, angle) {
  const r = part.axisBasis ? point.u : Math.abs(point.u);
  return revolvePlacement(part,r*Math.sin(angle),point.v,r*Math.cos(angle));
}
export function revolveBounds(part) {
  assertRevolveProfile(part.pts);
  const {start,end}=revolveInterval(part),angles=[start,end];
  if (part.axisBasis) {
    for (const key of ["x","y","z"]) {
      const phase = Math.atan2(part.axisBasis.tangent[key],part.axisBasis.radial[key]);
      for (let a=phase+Math.ceil((start-phase)/Math.PI)*Math.PI; a<end; a+=Math.PI) angles.push(a);
    }
  } else for(let a=Math.ceil(start/(Math.PI/2))*Math.PI/2;a<end;a+=Math.PI/2)angles.push(a);
  const bounds={x0:Infinity,y0:Infinity,z0:Infinity,x1:-Infinity,y1:-Infinity,z1:-Infinity};
  for(const p of part.pts||[])for(const a of angles){const q=revolvePoint(part,p,a);for(const key of ['x','y','z']){bounds[key+'0']=Math.min(bounds[key+'0'],q[key]);bounds[key+'1']=Math.max(bounds[key+'1'],q[key]);}}
  return bounds;
}
// Legacy parts own their body placement, while their retained feature owns the
// sketch reference. The sketch may also move during save normalization.
export function retainedSketchRevolve(part,feature) {
  if(part.kind!=="rev" || !part.sketchDriven || feature?.type!=="revolve" ||
     !isSketchAxis(feature.params?.axis) || !feature.params.profileEntityIds?.length)return null;
  return {...feature,params:{...feature.params,x:part.x ?? 0,y:part.y ?? 0,z:part.z ?? 0}};
}

export function revolveRecipe(part) {
  const points=part.pts||[];
  assertRevolveProfile(points);
  const recipe={radialProfile:true, axis:part.axis || "y", angle:part.angle ?? 360,
    direction:part.direction, symmetric:part.symmetric, x:part.x || 0, y:part.y || 0, z:part.z || 0};
  if(part.axisBasis){
    // Curved sections retain their sketch-space analytic wire in the exact
    // part recipe. The preview carries the sampled signed meridian.
    return {...recipe,axisBasis:part.axisBasis,points,...(part.revolveProfile?{
      ...part.revolveProfile,sketchAxisCoordinates:true
    }:{})};
  }
  return {...recipe,points:points.map(q=>({u:Math.abs(q.u ?? q.x),v:q.v ?? q.y}))};
}

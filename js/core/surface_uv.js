const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const unit=(v)=>{const length=Math.hypot(v.x,v.y,v.z)||1;return{x:v.x/length,y:v.y/length,z:v.z/length};};
const add=(a,b)=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
const mul=(v,s)=>({x:v.x*s,y:v.y*s,z:v.z*s});

export function supportsSurfaceUV(descriptor) { return ["cylinder","cone","sphere"].includes(descriptor?.surface); }

function basis(descriptor) {
  const axis=unit(descriptor.axis || {x:0,y:1,z:0}),seed=Math.abs(axis.x)<.9?{x:1,y:0,z:0}:{x:0,y:0,z:1},uAxis=unit(cross(axis,seed)),radial=unit(cross(uAxis,axis));
  return {axis,radial,uAxis};
}

export function surfacePoint(descriptor,u,v) {
  if(!supportsSurfaceUV(descriptor))throw new Error("Unsupported UV surface: "+String(descriptor?.surface));
  if(descriptor.surface==="sphere"){
    const radius=Number(descriptor.radius)||1,center=descriptor.center || descriptor.origin || {x:0,y:0,z:0},{axis,radial,uAxis}=basis({...descriptor,axis:descriptor.axis || {x:0,y:1,z:0}}),longitude=u/radius,latitude=v/radius,ring=Math.cos(latitude)*radius;
    return add(center,add(mul(axis,Math.sin(latitude)*radius),add(mul(radial,Math.cos(longitude)*ring),mul(uAxis,Math.sin(longitude)*ring))));
  }
  const {axis,radial,uAxis}=basis(descriptor),origin=descriptor.origin || {x:0,y:0,z:0},baseRadius=Number(descriptor.radius)||1,radius=descriptor.surface==="cone"?Math.max(1e-6,baseRadius+v*Math.tan(Number(descriptor.angle)||0)):baseRadius,angle=u/Math.max(radius,1e-6);
  return add(origin,add(mul(axis,v),add(mul(radial,Math.cos(angle)*radius),mul(uAxis,Math.sin(angle)*radius))));
}

export function surfaceNormal(descriptor,u,v) {
  const point=surfacePoint(descriptor,u,v),center=descriptor.surface==="sphere"?(descriptor.center || descriptor.origin):add(descriptor.origin || {x:0,y:0,z:0},mul(unit(descriptor.axis || {x:0,y:1,z:0}),v));
  return unit({x:point.x-center.x,y:point.y-center.y,z:point.z-center.z});
}

export function createSurfaceSketch(reference,options={}) {
  const descriptor=reference?.descriptor;if(!supportsSurfaceUV(descriptor))throw new Error("Selected face has no supported UV parameterization");
  return {id:options.id || "sketch:surface:"+reference.persistentId,name:options.name || "Surface sketch",plane:"front",frameSpace:"surface-uv",surface:{type:descriptor.surface,descriptor:structuredClone(descriptor)},support:structuredClone(reference),referenceId:reference.persistentId,points:[],entities:[],constraints:[],seamOffset:Number(options.seamOffset)||0};
}

export function surfaceSketchPolyline(sketch,entity) {
  const points=new Map((sketch.points || []).map((point)=>[point.id,point])),ids=entity.type==="line"?[entity.a,entity.b]:[];
  return ids.map((id)=>points.get(id)).filter(Boolean).map((point)=>surfacePoint(sketch.surface.descriptor,point.x+(sketch.seamOffset || 0),point.y));
}

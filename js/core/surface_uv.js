const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const unit=(v)=>{const length=Math.hypot(v.x,v.y,v.z)||1;return{x:v.x/length,y:v.y/length,z:v.z/length};};
const add=(a,b)=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
const mul=(v,s)=>({x:v.x*s,y:v.y*s,z:v.z*s});

export function supportsSurfaceUV(descriptor) { return ["cylinder","cone","sphere"].includes(descriptor?.surface); }

// Native axisRange is measured from referenceOrigin; UV V is measured from origin.
// U is periodic on a cylinder, so its circumference is not a finite trimming range.
export function cylinderUVDomain(descriptor) {
  if(descriptor?.surface !== 'cylinder' || !(descriptor.radius > 0))return null;
  const result={uPeriod:2*Math.PI*descriptor.radius,vRange:null};
  const range=descriptor.axisRange,reference=descriptor.referenceOrigin,origin=descriptor.origin,axis=descriptor.axis;
  if(Array.isArray(range)&&range.length===2&&range.every(Number.isFinite)&&reference&&origin&&axis&&Math.hypot(axis.x,axis.y,axis.z)>0){
    const offset=dot({x:reference.x-origin.x,y:reference.y-origin.y,z:reference.z-origin.z},unit(axis));
    if(Number.isFinite(offset))result.vRange=range.map(value=>value+offset).sort((a,b)=>a-b);
  }
  return result;
}

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
  const {axis,radial,uAxis}=basis(descriptor),origin=descriptor.origin || {x:0,y:0,z:0};
  let baseRadius=Number(descriptor.radius)||1;
  if(descriptor.surface==="cone" && descriptor.referenceOrigin){
    const shift=dot({x:origin.x-descriptor.referenceOrigin.x,y:origin.y-descriptor.referenceOrigin.y,z:origin.z-descriptor.referenceOrigin.z},axis);
    baseRadius=Math.max(1e-6,baseRadius+shift*Math.tan(Number(descriptor.angle)||0));
  }
  const radius=descriptor.surface==="cone"?Math.max(1e-6,baseRadius+v*Math.tan(Number(descriptor.angle)||0)):baseRadius,angle=u/Math.max(radius,1e-6);
  return add(origin,add(mul(axis,v),add(mul(radial,Math.cos(angle)*radius),mul(uAxis,Math.sin(angle)*radius))));
}

export function surfaceNormal(descriptor,u,v) {
  const point=surfacePoint(descriptor,u,v),center=descriptor.surface==="sphere"?(descriptor.center || descriptor.origin):add(descriptor.origin || {x:0,y:0,z:0},mul(unit(descriptor.axis || {x:0,y:1,z:0}),v));
  const radial=unit({x:point.x-center.x,y:point.y-center.y,z:point.z-center.z});
  if(descriptor.surface==='cone'){
    const axis=unit(descriptor.axis || {x:0,y:1,z:0}),angle=Number(descriptor.angle)||0;
    return unit(add(mul(radial,Math.cos(angle)),mul(axis,-Math.sin(angle))));
  }
  return radial;
}

export function createSurfaceSketch(reference,options={}) {
  const descriptor=reference?.descriptor;if(!supportsSurfaceUV(descriptor))throw new Error("Selected face has no supported UV parameterization");
  return {id:options.id || "sketch:surface:"+reference.persistentId,name:options.name || "Surface sketch",plane:"front",frameSpace:"surface-uv",surface:{type:descriptor.surface,descriptor:structuredClone(descriptor)},support:structuredClone(reference),referenceId:reference.persistentId,points:[],entities:[],constraints:[],seamOffset:Number(options.seamOffset)||0};
}

export function surfaceSketchPolyline(sketch,entity) {
  const points=new Map((sketch.points || []).map((point)=>[point.id,point])),ids=entity.type==="line"?[entity.a,entity.b]:[];
  return ids.map((id)=>points.get(id)).filter(Boolean).map((point)=>surfacePoint(sketch.surface.descriptor,point.x+(sketch.seamOffset || 0),point.y));
}

// UV lines become curves on the owning surface. Sample between UV vertices so
// the display follows the surface rather than cutting straight through it.
export function surfaceSketchWorldPolyline(sketch,points) {
  const descriptor=sketch.surface?.descriptor;
  if(!supportsSurfaceUV(descriptor))throw new Error('Unsupported sketch surface');
  if(!points?.length)return [];
  const seam=Number(sketch.seamOffset)||0;
  const step=Math.max(1e-6,Math.abs(Number(descriptor.radius)||1)*Math.PI/36);
  const map=point=>surfacePoint(descriptor,point.u+seam,point.v);
  const result=[map(points[0])];
  for(let index=1;index<points.length;index++){
    const a=points[index-1],b=points[index];
    const count=Math.min(256,Math.max(1,Math.ceil(Math.hypot(b.u-a.u,b.v-a.v)/step)));
    for(let sample=1;sample<=count;sample++){
      const t=sample/count;
      result.push(map({u:a.u+(b.u-a.u)*t,v:a.v+(b.v-a.v)*t}));
    }
  }
  return result;
}

// Shared pattern semantics for the authoring UI, lightweight model projection,
// and exact-kernel adapter. Keeping these calculations in one place prevents
// the live preview from disagreeing with the committed feature.

const AXES = ["x", "y", "z"];
export const LINEAR_PATTERN_INSTANCE_LIMIT = 128;

export function linearPatternDirection(params = {}) {
  const hasAxisToggles = AXES.some((axis) => Object.prototype.hasOwnProperty.call(params, "axis" + axis.toUpperCase()));
  if (hasAxisToggles) {
    const direction = {
      x: params.axisX ? 1 : 0,
      y: params.axisY ? 1 : 0,
      z: params.axisZ ? 1 : 0,
    };
    if (direction.x || direction.y || direction.z) return direction;
  }
  const explicit = params.direction;
  if (explicit && (Number(explicit.x) || Number(explicit.y) || Number(explicit.z))) {
    return { x:Number(explicit.x) || 0, y:Number(explicit.y) || 0, z:Number(explicit.z) || 0 };
  }
  const axis = AXES.includes(params.directionAxis) ? params.directionAxis : "x";
  return { x:axis === "x" ? 1 : 0, y:axis === "y" ? 1 : 0, z:axis === "z" ? 1 : 0 };
}

export function patternAxisEnabled(params = {}, axis) {
  const key = "axis" + String(axis || "x").toUpperCase();
  if (Object.prototype.hasOwnProperty.call(params, key)) return !!params[key];
  const direction = linearPatternDirection(params);
  return !!direction[axis];
}

export function linearPatternAxes(params = {}) {
  const toggled = AXES.filter((axis) => Object.prototype.hasOwnProperty.call(params, "axis" + axis.toUpperCase()) && params["axis" + axis.toUpperCase()]);
  if (AXES.some((axis) => Object.prototype.hasOwnProperty.call(params, "axis" + axis.toUpperCase()))) {
    return (toggled.length ? toggled : ["x"]).map((axis) => ({ axis, component:1 }));
  }
  // Old documents used one free direction vector. Preserve that as one pattern
  // step instead of unexpectedly turning a legacy diagonal into a grid.
  const direction = linearPatternDirection(params);
  return [{ axis:"vector", vector:direction, component:1 }];
}

export function parseSkippedPatternInstances(value) {
  const skipped=new Set();
  const add=(number)=>{const instance=Math.round(Number(number));if(Number.isFinite(instance)&&instance>0)skipped.add(instance);};
  if(Array.isArray(value)){value.forEach(add);return skipped;}
  String(value || "").split(/[\s,;]+/).filter(Boolean).forEach((token)=>{
    const range=token.match(/^(\d+)\s*-\s*(\d+)$/);
    if(!range){add(token);return;}
    const start=Math.min(Number(range[1]),Number(range[2])),end=Math.max(Number(range[1]),Number(range[2]));
    for(let instance=start;instance<=end&&instance-start<LINEAR_PATTERN_INSTANCE_LIMIT;instance++)add(instance);
  });
  return skipped;
}

export function linearPatternAxisDefinitions(params = {}, countValue, limit = LINEAR_PATTERN_INSTANCE_LIMIT) {
  const axes=linearPatternAxes(params),legacyCount=Math.max(2,Math.min(100,Math.round(Number(countValue ?? params.count) || 2)));
  const definitions=axes.map((entry)=>{
    if(entry.axis==="vector")return {...entry,count:legacyCount,spacing:Number(params.spacing)||0,spacingIncrement:Number(params.spacingIncrement)||0};
    const suffix=entry.axis.toUpperCase(),count=Math.max(2,Math.min(100,Math.round(Number(params["count"+suffix] ?? legacyCount) || 2)));
    return {...entry,count,spacing:Number(params["spacing"+suffix] ?? params.spacing) || 0,spacingIncrement:Number(params["spacingIncrement"+suffix] ?? params.spacingIncrement) || 0};
  });
  const product=()=>definitions.reduce((total,definition)=>total*definition.count,1);
  while(product()>limit){
    const reducible=definitions.filter((definition)=>definition.count>2).sort((a,b)=>b.count-a.count)[0];
    if(!reducible)break;reducible.count--;
  }
  return definitions;
}

export function linearPatternCountPerAxis(params = {}, countValue, limit = LINEAR_PATTERN_INSTANCE_LIMIT) {
  const requested = Math.max(2, Math.round(Number(countValue ?? params.count) || 2));
  const dimensions = Math.max(1, linearPatternAxes(params).length);
  return Math.max(2, Math.min(requested, Math.floor(Math.pow(Math.max(2, limit), 1 / dimensions) + 1e-9)));
}

export function linearPatternOffsets(params = {}, countValue, limit = LINEAR_PATTERN_INSTANCE_LIMIT) {
  const definitions=linearPatternAxisDefinitions(params,countValue,limit),offsets=[{x:0,y:0,z:0,indices:[]}];
  definitions.forEach((entry) => {
    const prior = offsets.slice();offsets.length=0;
    prior.forEach((base) => {
      for (let index=0;index<entry.count;index++) {
        const next={x:base.x,y:base.y,z:base.z,indices:base.indices.concat(index)},distance=entry.spacing*index+entry.spacingIncrement*index*(index-1)/2;
        if(entry.axis === "vector") {
          next.x += Number(entry.vector.x || 0) * distance;
          next.y += Number(entry.vector.y || 0) * distance;
          next.z += Number(entry.vector.z || 0) * distance;
        } else next[entry.axis] += distance;
        offsets.push(next);
      }
    });
  });
  const skipped=parseSkippedPatternInstances(params.skipInstances);
  return offsets.slice(1).map((offset,index)=>({...offset,instance:index+1})).filter((offset)=>!skipped.has(offset.instance));
}

export function circularPatternStepDegrees(params = {}, countValue) {
  const count = Math.max(2, Math.round(Number(countValue ?? params.count) || 2));
  const angle = Number(params.angle) || 360;
  if (params.equalSpacing === false) return angle;
  // A closed ring must not put the last copy on top of the seed. Partial arcs,
  // however, include both ends of the requested extent.
  return Math.abs(Math.abs(angle) - 360) < 1e-9 ? angle / count : angle / (count - 1);
}

export function circularPatternPivot(params = {}) {
  const axis=["x","y","z"].includes(params.axis)?params.axis:"y",distance=Number(params.radialDistance)||0;
  if(axis==="x")return {x:0,y:-distance,z:0};
  return {x:-distance,y:0,z:0};
}

export function rotatePointAroundAxis(point, axis, angle, pivot = {}) {
  const px=Number(pivot.x)||0,py=Number(pivot.y)||0,pz=Number(pivot.z)||0,x=(Number(point?.x)||0)-px,y=(Number(point?.y)||0)-py,z=(Number(point?.z)||0)-pz;
  const c = Math.cos(Number(angle) || 0), s = Math.sin(Number(angle) || 0);
  if (axis === "x") return { x:x+px, y:y*c-z*s+py, z:y*s+z*c+pz };
  if (axis === "z") return { x:x*c-y*s+px, y:x*s+y*c+py, z:z+pz };
  return { x:x*c+z*s+px, y:y+py, z:-x*s+z*c+pz };
}

export function rotatedPatternBounds(bounds, rotations = []) {
  if (!bounds || !rotations.length) return bounds;
  const points = [];
  for (const x of [bounds.x0, bounds.x1]) for (const y of [bounds.y0, bounds.y1]) for (const z of [bounds.z0, bounds.z1]) {
    let point = { x, y, z };
    rotations.forEach((rotation) => { point = rotatePointAroundAxis(point, rotation.axis, rotation.angle, rotation.pivot); });
    points.push(point);
  }
  return {
    x0:Math.min(...points.map((point) => point.x)), x1:Math.max(...points.map((point) => point.x)),
    y0:Math.min(...points.map((point) => point.y)), y1:Math.max(...points.map((point) => point.y)),
    z0:Math.min(...points.map((point) => point.z)), z1:Math.max(...points.map((point) => point.z)),
  };
}

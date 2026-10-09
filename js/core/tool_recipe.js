// Shared interpretation of recorded cut and merge tools. Viewport rebuilding,
// exact export and movement all consume these same parameter conventions.
const clone = value => value == null ? value : structuredClone(value);

export function toolRangeForAxis(bounds, axis) {
  const key=axis==="x"?"x":axis==="y"?"y":"z";
  const lo=bounds[key+"0"], hi=bounds[key+"1"], pad=Math.max(2,(hi-lo)*0.08);
  return {from:lo-pad,to:hi+pad};
}

export function toolFeatureRecipe(merge, bodyBounds) {
  if (merge.kind === "hole") return {type:"holeTool",params:clone(merge.params)};
  /* A pattern instance: another body's shape under one rigid transform. The
     recipe is the body itself, because the copy is a copy of the whole body —
     holes, 3D cuts and finish operations included — and not of a profile. */
  if (merge.kind === "placed") return { type:"placedBody", params:{ part:clone(merge.part), placements:clone(merge.placements || []) } };
  if (merge.kind === "revolve") return { type:"revolve", params:{ ...(merge.radialProfile?{radialProfile:true,symmetric:!!merge.symmetric}:{}), axis:merge.axis || "y", angle:Number(merge.angle)||360, direction:merge.direction, points:clone(merge.loop || []) } };
  if (merge.kind === "sweep") return { type:"sweep", params:{ profile:clone(merge.profile || []), path:clone(merge.path || []), ...(merge.pathSegments?{pathSegments:clone(merge.pathSegments)}:{}), ...(merge.profileSegments?{profileSegments:clone(merge.profileSegments)}:{}), ...(merge.sketchSources?{sketchSources:clone(merge.sketchSources)}:{}), orientation:merge.orientation, twistAngle:merge.twistAngle, scale:merge.scale, solid:true } };
  if (merge.kind === "loft") return { type:"loft", params:{ sections:clone(merge.sections || []), ...(merge.sketchSources?{sketchSources:clone(merge.sketchSources)}:{}), ...(merge.sectionSegments?{sectionSegments:clone(merge.sectionSegments)}:{}), solid:merge.solid !== false, ruled:!!merge.ruled, matchProfiles:merge.matchProfiles !== false, continuity:merge.continuity, tolerance:merge.tolerance } };
  if (merge.kind) return null;
  var range=Number.isFinite(merge.from) && Number.isFinite(merge.to) ? {from:merge.from,to:merge.to}
    : bodyBounds ? toolRangeForAxis(bodyBounds,merge.axis) : {from:merge.from,to:merge.to};
  return { type:"extrude", params:{ axis:merge.axis, ...(merge.frame ? {frame:clone(merge.frame)} : {}), from:range.from, to:range.to, points:clone(merge.loop || []), ...(merge.holes ? {holes:clone(merge.holes)} : {}), ...(merge.segments ? {segments:clone(merge.segments)} : {}), draftAngle:Number(merge.draftAngle)||0, draftOutward:!!merge.draftOutward, ...(Number.isFinite(merge.draftBase) ? {draftBase:merge.draftBase} : {}) } };
}

export function translateToolRecord(tool, dx, dy, dz) {
  if(tool.kind==='hole') {
    const params=tool.params;
    if(params.frame?.origin){params.frame.origin.x+=dx;params.frame.origin.y+=dy;params.frame.origin.z+=dz;}
    else {
      const axis=params.axis || 'y',du=axis==='x'?dz:dx,dv=axis==='y'?dz:dy,dw=axis==='x'?dx:axis==='z'?dz:dy;
      (params.centres || []).forEach(p=>{p.u+=du;p.v+=dv;});params.from=(params.from || 0)+dw;
    }
    return tool;
  }
  if(tool.frame?.origin){
    tool.frame.origin.x+=dx;tool.frame.origin.y+=dy;tool.frame.origin.z+=dz;
  } else if(!tool.kind && ["x","y","z"].includes(tool.axis)) {
    const du=tool.axis==="x"?dz:dx, dv=tool.axis==="y"?dz:dy, dw=tool.axis==="x"?dx:tool.axis==="y"?dy:dz;
    (tool.loop || []).forEach(point=>{point.u+=du;point.v+=dv;});
    const curvePoints=new Set();
    for(const segment of tool.segments || []) {
      for(const key of ['from','to','mid','center'])if(segment[key])curvePoints.add(segment[key]);
      for(const point of [...(segment.points || []),...(segment.controls || [])])curvePoints.add(point);
    }
    curvePoints.forEach(point=>{point.u+=du;point.v+=dv;});
    for(const key of ["from","to","draftBase"])if(Number.isFinite(tool[key]))tool[key]+=dw;
  } else if(tool.kind==="sweep" || tool.kind==="loft") {
    const points=tool.kind==="sweep"?(tool.profile || []).concat(tool.path || []):(tool.sections || []).flat();
    for(const segments of [tool.pathSegments,tool.profileSegments])for(const segment of segments||[]){for(const key of ["from","to","mid","center"])if(segment[key])points.push(segment[key]);points.push(...(segment.controls||[]),...(segment.points||[]));}
    new Set(points).forEach(point=>{point.x+=dx;point.y+=dy;point.z+=dz;});
  }
  // Placed bodies are translated in their host's frame by movePart. A revolve
  // needs a transformed axis as well as a profile, so it is not a point shift.
  return tool;
}

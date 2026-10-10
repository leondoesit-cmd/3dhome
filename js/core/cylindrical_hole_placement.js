import { frameFromPlane } from './frame.js';
import { solveCylindricalPositionConstraints } from './cylindrical_position_constraints.js';

function isSolidCircleProfile(feature, circle) {
  const p=feature?.params,ids=p?.profileEntityIds;
  return !!circle && !circle.construction && Array.isArray(ids) && ids.length===1 && ids[0]===circle.id
    && !(p.holeProfileEntityIds || []).length && !(p.regionProfileEntityIds || []).length;
}

// A constrained radial position on a straight, Top-plane circular extrusion.
// Retain the circle identity rather than freezing its tessellated face radius.
export function cylindricalHolePlacement(params, document, options={}) {
  const source=params.cylindricalSource;
  if(!source)throw new Error('Select a cylindrical extrusion face');
  const feature=document?.features?.find(item=>item.id===source.featureId);
  const sketch=document?.sketches?.find(item=>item.id===feature?.params?.sketchId);
  const circle=sketch?.entities?.find(item=>item.id===source.circleId && item.type==='circle');
  const centre=sketch?.points?.find(item=>item.id===circle?.c);
  if(feature?.type!=='extrude' || sketch?.plane!=='top' || sketch.frameSpace==='local' || !isSolidCircleProfile(feature,circle) || !centre || feature.params?.draftAngle || feature.params?.thinFeature)
    throw new Error('Radial placement requires an undrafted Top-plane circular extrusion');
  const p=feature.params,reverse=p.direction==='reverse'?-1:1;
  const symmetric=p.symmetric || p.endCondition==='mid-plane';
  if(p.endCondition && !['blind','mid-plane'].includes(p.endCondition))throw new Error('Radial placement requires a blind or mid-plane cylinder');
  const depth=Number(p.depth),start=(Number(sketch.offset)||0)+reverse*(Number(p.offset)||0);
  const from=symmetric?start-reverse*depth/2:start;
  const to=symmetric?start+reverse*depth/2:start+reverse*depth;
  const distance=Number(params.cylinderTopDistance),angle=Number(params.cylinderAngle)*Math.PI/180;
  if(!(circle.r>0) || !Number.isFinite(from) || !Number.isFinite(to) || !Number.isFinite(distance) || distance<0 || distance>Math.abs(to-from) || (!Number.isFinite(angle)&&params.cylinderPlacementMethod!=='constraints'))throw new Error('Cylinder position must lie between its end faces');
  let radial={x:Math.sin(angle),y:0,z:Math.cos(angle)},origin={x:centre.x+radial.x*circle.r,y:Math.max(from,to)-distance,z:centre.y+radial.z*circle.r},positionGraph;
  if(params.cylinderPlacementMethod==='constraints'){
    positionGraph=solveCylindricalPositionConstraints({centre:{x:centre.x,z:centre.y},radius:circle.r,top:Math.max(from,to),bottom:Math.min(from,to),topDistance:distance,branch:params.cylinderConstraintBranch || 'positive-z',onSurface:params.cylinderOnSurface ?? true,alongZ:params.cylinderAlongZ ?? true,alongY:params.cylinderAlongY ?? true,source:{featureId:source.featureId,circleId:source.circleId,faceReference:source.faceReference}});
    if(positionGraph.status!=='fully-defined' && !options.allowUnderdefined)throw new Error('3D cylindrical position is '+positionGraph.status+' · '+positionGraph.degreesOfFreedom+' DOF; restore required relations');
    origin=positionGraph.points.P;radial={x:0,y:0,z:positionGraph.branch==='positive-z'?1:-1};
  }else if(params.cylinderPlacementMethod && params.cylinderPlacementMethod!=='angular')throw new Error('Choose a valid cylindrical placement method');
  // Outward frame normal plus support=true makes the cutter travel inward.
  return {frame:frameFromPlane(origin,radial,{x:1,y:0,z:0}),centres:[{u:0,v:0}],support:{kind:'cylindrical-position',sourceFeatureId:feature.id},from:0,axis:radial,...(positionGraph?{positionGraph}:{})};
}

export function cylindricalHoleSource(document, face) {
  if(face?.descriptor?.surface!=='cylinder')return null;
  const feature=document?.features?.find(item=>item.id===(face.ownerFeatureId || face.featureId));
  const sketch=document?.sketches?.find(item=>item.id===feature?.params?.sketchId);
  const circles=sketch?.entities?.filter(item=>item.type==='circle' && !item.construction);
  if(feature?.type!=='extrude' || sketch?.plane!=='top' || sketch.frameSpace==='local' || circles?.length!==1 || !isSolidCircleProfile(feature,circles[0]) || feature.params?.draftAngle || feature.params?.thinFeature)return null;
  return {featureId:feature.id,circleId:circles[0].id,faceReference:structuredClone(face)};
}

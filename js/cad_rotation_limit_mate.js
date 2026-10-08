import {norm,dot,apply,transpose,rotationOf,perpendicular,signedAngle,axisAngleMatrix,mul,setRotation} from './cad_mate_model.js';

// A signed rotational stop around reference A's directed native hinge axis.
// It supplies an angular constraint only; ordinary hinge/bearing mates locate
// and align the selected axes. Canonical values are degrees.
export function rotationLimitMateSpec(angleMin=-20,angleMax=0,reverse=false,driveAngle=null) {
  if(!Number.isFinite(angleMin) || !Number.isFinite(angleMax) || angleMin>angleMax
    || !Number.isFinite(angleMin*Math.PI/180) || !Number.isFinite(angleMax*Math.PI/180)
    || angleMax-angleMin>360 || typeof reverse!=='boolean'
    || (driveAngle!==null && (!Number.isFinite(driveAngle) || driveAngle<angleMin || driveAngle>angleMax)))return null;
  return {angleMin,angleMax,reverse,...(driveAngle===null?{}:{driveAngle})};
}
const finiteMarker=marker=>marker && ['x','y','z'].every(key=>Number.isFinite(marker[key])) && Math.hypot(marker.x,marker.y,marker.z)>1e-9;

export function captureRotationLimitZero(mate,fa,fb,reader,moving) {
  if(!reader || !moving || !fa?.axis || !fb?.axis)return false;
  if(finiteMarker(mate.rotationMarkerA) && finiteMarker(mate.rotationMarkerB))return true;
  const a=rotationOf(reader.transform),b=rotationOf(moving.transform),axis=norm(fa.axis);
  mate.rotationMarkerA=perpendicular(apply(transpose(a),axis));
  const mark=apply(a,mate.rotationMarkerA);
  // A saved driven pose without its zero is re-anchored without moving it.
  // Creation/settings helpers capture an undriven zero before assigning drive.
  const angle=(mate.reverse?-1:1)*(Number.isFinite(mate.driveAngle)?mate.driveAngle:0)*Math.PI/180;
  mate.rotationMarkerB=apply(transpose(b),apply(axisAngleMatrix(axis,angle),mark));
  return true;
}

export function rotationLimitMeasure(mate,fa,fb,reader,moving) {
  if(!Number.isFinite(mate.angleMin) || !Number.isFinite(mate.angleMax))return null;
  const spec=rotationLimitMateSpec(mate.angleMin,mate.angleMax,mate.reverse ?? false,mate.driveAngle ?? null);
  if(!spec || !fa?.axis || !fb?.axis || !reader || !moving
    || !finiteMarker(mate.rotationMarkerA) || !finiteMarker(mate.rotationMarkerB))return null;
  const axis=norm(fa.axis),a=apply(rotationOf(reader.transform),mate.rotationMarkerA),b=apply(rotationOf(moving.transform),mate.rotationMarkerB);
  // Project the transported marks into the actual hinge plane while Newton
  // probes the ordinary bearing rows; no world-space/Euler sign is consulted.
  const project=mark=>{
    const planar={x:mark.x-axis.x*dot(mark,axis),y:mark.y-axis.y*dot(mark,axis),z:mark.z-axis.z*dot(mark,axis)};
    return Math.hypot(planar.x,planar.y,planar.z)>1e-9?norm(planar):null;
  };
  const markA=project(a),markB=project(b);if(!markA || !markB)return null;
  const raw=(mate.reverse?-1:1)*signedAngle(axis,markA,markB);
  const lo=mate.angleMin*Math.PI/180,hi=mate.angleMax*Math.PI/180;
  // A rotational pose is periodic. Choose its equivalent nearest the interval
  // center, making intervals such as 170..190 degrees continuous across π.
  const center=(lo+hi)/2,angle=raw+2*Math.PI*Math.round((center-raw)/(2*Math.PI));
  const target=Number.isFinite(mate.driveAngle)?mate.driveAngle*Math.PI/180:Math.max(lo,Math.min(hi,angle));
  const error=angle-target;
  return {angle,angleDegrees:angle*180/Math.PI,target,error,linear:0,angular:Math.abs(error),rows:[error*10]};
}

export function seedRotationLimit(mate,fa,fb,reader,moving,movable) {
  if(!movable)return;
  const state=rotationLimitMeasure(mate,fa,fb,reader,moving);
  if(!state || Math.abs(state.error)<1e-12)return;
  const turn=-(mate.reverse?-1:1)*state.error;
  const rotation=axisAngleMatrix(norm(fa.axis),turn),t=moving.transform;
  const offset=apply(rotation,{x:t.x-fb.origin.x,y:t.y-fb.origin.y,z:t.z-fb.origin.z});
  Object.assign(t,{x:fb.origin.x+offset.x,y:fb.origin.y+offset.y,z:fb.origin.z+offset.z});
  setRotation(t,mul(rotation,rotationOf(t)));
}

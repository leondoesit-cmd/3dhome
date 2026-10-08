import {dot,norm,wrapAngle,axisAngleMatrix,mul,rotationOf,setRotation,apply,transpose,perpendicular,signedAngle} from './cad_mate_model.js';
import {lengthFromDocument} from './core/document_length_units.js';

// A is the pinion rotation axis; B is the rack's directed travel axis.
// The pitch radius is a canonical length in cm, not the visible tooth radius.
export function rackPinionMateSpec(pitchRadius,reverse=false,driveTurns=null,unit='cm') {
  const radius=lengthFromDocument(pitchRadius,unit);
  if(!Number.isFinite(radius) || !(radius>0) || typeof reverse!=='boolean'
    || (driveTurns!==null && !Number.isFinite(driveTurns)))return null;
  return {pitchRadius:radius,reverse,...(driveTurns===null?{}:{driveTurns})};
}

// Axis lines have no distinguished point along their length. Rebuilding the
// rack's cylindrical socket can change its centroid without moving the ram.
// The references define directions; component origins define stable travel.
const travelOf=(fb,pinion,rack)=>dot({x:rack.transform.x-pinion.transform.x,y:rack.transform.y-pinion.transform.y,z:rack.transform.z-pinion.transform.z},norm(fb.axis));
// Relative spin remains unchanged when the entire press is rigidly placed in
// another assembly. A world-space roll would incorrectly turn common yaw into
// rack travel, even though neither joint moved relative to its guide.
const relativeRoll=(fa,pinion,rack)=>{
  const axis=norm(fa.axis),a=rotationOf(pinion.transform),b=rotationOf(rack.transform);
  const ma=apply(a,perpendicular(apply(transpose(a),axis)));
  const mb=apply(b,perpendicular(apply(transpose(b),axis)));
  return signedAngle(axis,mb,ma);
};
const valid=mate=>Number.isFinite(mate?.pitchRadius) && mate.pitchRadius>0
  && (mate.reverse===undefined || typeof mate.reverse==='boolean')
  && (mate.driveTurns===undefined || Number.isFinite(mate.driveTurns));

export function captureRackPinionZero(mate,fa,fb,pinion,rack) {
  if(!valid(mate) || !fa?.axis || !fb?.axis || !pinion || !rack)return false;
  if(Number.isFinite(mate.pinionRoll0) && Number.isFinite(mate.rackTravel0))return true;
  const turns=Number.isFinite(mate.driveTurns)?mate.driveTurns:0;
  const signedRadius=(mate.reverse?-1:1)*mate.pitchRadius;
  mate.pinionRoll0=relativeRoll(fa,pinion,rack)-2*Math.PI*turns;
  mate.rackTravel0=travelOf(fb,pinion,rack)-signedRadius*2*Math.PI*turns;
  return true;
}

// A periodic phase is smooth across the pinion's quaternion/Euler wrap.
// Translation itself carries the unwrapped winding, so free coupling remains
// one constraint even after the rack traverses several pinion circumferences.
export function rackPinionMeasure(mate,fa,fb,pinion,rack) {
  if(!valid(mate) || !fa?.axis || !fb?.axis || !pinion || !rack
    || !Number.isFinite(mate.pinionRoll0) || !Number.isFinite(mate.rackTravel0))return null;
  const radius=(mate.reverse?-1:1)*mate.pitchRadius;
  const roll=relativeRoll(fa,pinion,rack)-mate.pinionRoll0;
  const travel=travelOf(fb,pinion,rack)-mate.rackTravel0;
  const phase=travel/radius-roll;
  const rows=[Math.sin(phase)*mate.pitchRadius,(Math.cos(phase)-1)*mate.pitchRadius];
  let driveTravelError=0,driveRollError=0;
  if(Number.isFinite(mate.driveTurns)){
    const angle=2*Math.PI*mate.driveTurns;
    driveTravelError=travel-radius*angle;
    driveRollError=wrapAngle(roll-angle);
    rows.push(driveTravelError,Math.sin(driveRollError)*mate.pitchRadius,
      (Math.cos(driveRollError)-1)*mate.pitchRadius);
  }
  return {rows,phase,travel,roll,linear:Math.max(Math.abs(wrapAngle(phase)*mate.pitchRadius),
    Math.abs(driveTravelError),Math.abs(driveRollError*mate.pitchRadius)),angular:0};
}

// A half-turn phase is a stationary point of a periodic least-squares pair.
// Seed along the physical rack direction, or turn the pinion when the rack is
// prescribed. Ordinary bearing/guide/stop mates still decide the final pose.
export function seedRackPinion(mate,fa,fb,pinion,rack,pinionMovable,rackMovable) {
  const state=rackPinionMeasure(mate,fa,fb,pinion,rack);
  if(!state)return;
  const radius=(mate.reverse?-1:1)*mate.pitchRadius;
  let shift=0,turn=0;
  if(Number.isFinite(mate.driveTurns)){
    shift=radius*2*Math.PI*mate.driveTurns-state.travel;
    turn=wrapAngle(2*Math.PI*mate.driveTurns-state.roll);
  }else if(rackMovable)shift=-radius*wrapAngle(state.phase);
  else if(pinionMovable)turn=wrapAngle(state.phase);
  if(rackMovable){const axis=norm(fb.axis);for(const key of ['x','y','z'])rack.transform[key]+=shift*axis[key];}
  if(pinionMovable && Math.abs(turn)>1e-12)
    setRotation(pinion.transform,mul(axisAngleMatrix(norm(fa.axis),turn),rotationOf(pinion.transform)));
}

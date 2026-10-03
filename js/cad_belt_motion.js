import {dot,norm,screwRoll,setRotation,worldFrame,wrapAngle} from './cad_mate_model.js';

// The motor has an explicit, unwrapped angle. Euler/quaternion orientation
// alone cannot distinguish zero turns from an arbitrary number of whole turns.
export function prepareBeltMotorTurns(assembly,study,motions) {
  study.beltBaselines ||= {};
  for(const mate of assembly.topologyMates||[]){
    if(mate.type!=='belt')continue;
    const motion=motions.find(item=>item.componentId===mate.a?.componentId);
    if(!motion)continue;
    const component=assembly.components.find(item=>item.id===mate.a.componentId);
    const base={...component,transform:{...component.transform}};setRotation(base.transform,motion.baseRotation);
    const frame=worldFrame(mate.a.frame||mate.a.descriptor,base,mate.a.space);
    if(!frame?.axis)return {ok:false,issues:[{mate:mate.id,code:'invalid-belt-motor-axis'}]};
    const axis=norm(frame.axis),alignment=dot(axis,norm(motion.axis));
    if(Math.abs(alignment)<1-1e-6)return {ok:false,issues:[{mate:mate.id,code:'invalid-belt-motor-axis'}]};
    if(!Number.isFinite(study.beltBaselines[mate.id])){
      const roll=screwRoll(base,axis);
      study.beltBaselines[mate.id]=Number.isFinite(mate.beltTurnA)&&Number.isFinite(mate.beltLastRollA)
        ?mate.beltTurnA+wrapAngle(roll-mate.beltLastRollA):wrapAngle(roll-mate.rollA0);
    }
    mate.beltMotorTurnA=study.beltBaselines[mate.id]+Math.sign(alignment)*motion.angleDeg*Math.PI/180;
  }
  return {ok:true};
}

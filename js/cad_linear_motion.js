// Rigid linear kinematics in document length units (cm). No mesh deformation.
export function addLinearMotor(study, componentId, stroke = -1.5, duration = 1, axis = {x:0,y:1,z:0}, reciprocate = false) {
  const motor={id:'motor_'+crypto.randomUUID(),type:'linear',componentId,stroke,duration,axis,reciprocate};
  study.motors.push(motor);return motor;
}

export function linearMotionState(study,components,time) {
  const fail=(code,id)=>({ok:false,issues:[{code,componentId:id}]});
  const motions=[],seen=new Set();
  for(const motor of study.motors||[]) {
    if(motor.type!=='linear')continue;
    const component=components.find(c=>c.id===motor.componentId),length=Math.hypot(motor.axis?.x,motor.axis?.y,motor.axis?.z);
    if(!component||component.grounded)return fail(component?'grounded-motion-component':'missing-motion-component',motor.componentId);
    if(seen.has(component.id)||!Number.isFinite(motor.stroke)||!Number.isFinite(motor.duration)||motor.duration<=0||!Number.isFinite(length)||length<1e-9)return fail('invalid-linear-motor',component.id);
    seen.add(component.id);
    const base=motor.basePosition||{x:Number(component.transform?.x)||0,y:Number(component.transform?.y)||0,z:Number(component.transform?.z)||0};
    if(!['x','y','z'].every(k=>Number.isFinite(base[k])))return fail('invalid-motion-baseline',component.id);
    const elapsed=Math.max(0,time)/motor.duration;
    const cycle=elapsed%2,phase=motor.reciprocate?(cycle<=1?cycle:2-cycle):Math.min(1,elapsed);
    const position={};for(const key of ['x','y','z'])position[key]=base[key]+motor.axis[key]/length*motor.stroke*phase;
    if(!Object.values(position).every(Number.isFinite))return fail('invalid-linear-position',component.id);
    motor.basePosition={...base};
    motions.push({componentId:component.id,type:'linear',position,displacement:motor.stroke*phase});
  }
  return {ok:true,motions};
}

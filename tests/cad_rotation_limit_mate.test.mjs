import test from 'node:test';
import assert from 'node:assert/strict';
import {solveAssemblyMates} from '../js/cad_mate_solver.js';
import {topologyReference,rotationOf,axisAngleMatrix,mul,apply,setRotation,worldFrame} from '../js/cad_mate_model.js';
import {rotationLimitMateSpec,rotationLimitMeasure} from '../js/cad_rotation_limit_mate.js';
import {addRotationLimitMate,setRotationLimitMateSettings,setRotationLimitMateDrive,setRotationLimitMateReferences} from '../js/cad_rotation_limit_controls.js';
import {createMotionStudy,addRotaryMotor,evaluateMotionStudy} from '../js/cad_motion_study.js';

const p=(x=0,y=0,z=0)=>({x,y,z});
const ref=(id,name,axis=p(1),origin=p())=>topologyReference(id,'axis',name,{surface:'axis',origin,axis});
const plane=id=>topologyReference(id,'face','plane:right',{surface:'plane',origin:p(),normal:p(1)});
const pivot=p(0,.4,4.92),localPivot=p(0,1.4,4.92);
function hinge({min=-20,max=0,reverse=false,axisSign=1,movingAxisSign=1}={}) {
  const assembly={components:[
    {id:'box',grounded:true,transform:{...p(),rx:0,ry:0,rz:0}},
    {id:'clapper',transform:{...p(0,-1),rx:0,ry:0,rz:0}},
  ],topologyMates:[
    {id:'hinge-axis',type:'concentric',a:ref('box','pin',p(1),pivot),b:ref('clapper','bore',p(movingAxisSign),localPivot)},
    {id:'hinge-capture',type:'distance',value:0,aligned:true,a:plane('box'),b:plane('clapper')},
  ]};
  const result=addRotationLimitMate(assembly,{id:'lift',type:'rotationlimit',angleMin:min,angleMax:max,reverse,
    a:ref('box','reader-hinge-axis',p(axisSign),pivot),b:ref('clapper','moving-hinge-axis',p(movingAxisSign),localPivot)});
  assert.equal(result.ok,true,JSON.stringify(result));return assembly;
}
const moving=assembly=>assembly.components[1];
const rx=assembly=>{const r=rotationOf(moving(assembly).transform);return Math.atan2(r[2][1],r[1][1])*180/Math.PI;};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} versus ${b}`);
const state=assembly=>{
  const mate=assembly.topologyMates.find(m=>m.type==='rotationlimit');
  return rotationLimitMeasure(mate,worldFrame(mate.a.frame,assembly.components[0],'component'),worldFrame(mate.b.frame,moving(assembly),'component'),assembly.components[0],moving(assembly));
};
function prescribe(assembly,degrees) {
  const component=moving(assembly),rotation=axisAngleMatrix(p(1),degrees*Math.PI/180);
  setRotation(component.transform,rotation);
  const delta=apply(rotation,localPivot);
  Object.assign(component.transform,{x:pivot.x-delta.x,y:pivot.y-delta.y,z:pivot.z-delta.z});
}

test('directed rotational spec validates signed ranges, finite values, and a bounded drive',()=>{
  assert.deepEqual(rotationLimitMateSpec(),{angleMin:-20,angleMax:0,reverse:false});
  assert.deepEqual(rotationLimitMateSpec(170,190,false,180),{angleMin:170,angleMax:190,reverse:false,driveAngle:180});
  for(const args of [[20,0],[-181,181],[NaN,0],[0,Infinity],[1e308,1e308],[-20,0,false,1],[-20,0,false,-21],[-20,0,'false']])assert.equal(rotationLimitMateSpec(...args),null);
});

test('native hinge retains one freedom at both directed stops and in its interior',()=>{
  const assembly=hinge();
  for(const angle of [0,-10,-20]){
    prescribe(assembly,angle);const result=solveAssemblyMates(assembly);
    assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.degreesOfFreedom,1);
    near(rx(assembly),angle);near(state(assembly).angleDegrees,angle);
  }
});

test('missing or nonfinite canonical bounds are invalid native data rather than zero residuals',()=>{
  for(const value of [undefined,NaN,Infinity]){
    const assembly=hinge(),mate=assembly.topologyMates.find(m=>m.type==='rotationlimit');
    mate.angleMin=value;const result=solveAssemblyMates(assembly);
    assert.equal(result.ok,false);assert.ok(result.issues.some(issue=>issue.code==='invalid-rotation-limit-spec'));
  }
});

test('an undefined angular marker after an axis rebuild cannot masquerade as zero lift',()=>{
  const assembly=hinge(),mate=assembly.topologyMates.find(m=>m.type==='rotationlimit');
  mate.rotationMarkerA=p(1); // Parallel to the native axis: no angular zero exists.
  const result=solveAssemblyMates(assembly);
  assert.equal(result.ok,false);assert.ok(result.issues.length>0);
});

test('true signed backstop rejects prescribed backward lift rather than accepting unsigned magnitude',()=>{
  const assembly=hinge();prescribe(assembly,5);
  const result=solveAssemblyMates(assembly,{fixedComponentIds:['clapper']});
  assert.equal(result.ok,false);assert.ok(result.unsatisfied.some(issue=>issue.angular>.01),JSON.stringify(result));
  near(rx(assembly),5);
});

test('free out-of-range hinge settles to nearest signed stop without moving its pivot',()=>{
  const assembly=hinge();
  for(const [angle,expected] of [[5,0],[-25,-20]]){
    prescribe(assembly,angle);assert.equal(solveAssemblyMates(assembly).ok,true);near(rx(assembly),expected);
    const actual=worldFrame(ref('clapper','pivot',p(1),localPivot).frame,moving(assembly),'component').origin;
    for(const key of ['x','y','z'])near(actual[key],pivot[key]);
  }
});

test('reverse and opposed native axis signs define signed spin independently of Euler convention',()=>{
  for(const [reverse,axisSign,movingAxisSign,expected] of [[false,1,1,-10],[true,1,1,10],[false,-1,1,10],[false,1,-1,-10]]){
    const assembly=hinge({reverse,axisSign,movingAxisSign});
    const result=setRotationLimitMateDrive(assembly,'lift',-10);
    assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.degreesOfFreedom,0);
    near(rx(assembly),expected);near(state(assembly).angleDegrees,-10);
  }
});

test('driven exact stops persist across JSON reopen and blank drive restores hinge mobility',()=>{
  let assembly=hinge();assert.equal(setRotationLimitMateDrive(assembly,'lift',-20).ok,true);
  for(let reopen=0;reopen<3;reopen++){
    assembly=JSON.parse(JSON.stringify(assembly));const result=solveAssemblyMates(assembly);
    assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.degreesOfFreedom,0);near(rx(assembly),-20);
  }
  assert.equal(setRotationLimitMateDrive(assembly,'lift',null).ok,true);
  assert.equal(solveAssemblyMates(assembly).degreesOfFreedom,1);
});

test('equal directed bounds act as a fixed signed angular mate',()=>{
  const assembly=hinge({min:-10,max:-10});
  const result=solveAssemblyMates(assembly);assert.equal(result.ok,true);assert.equal(result.degreesOfFreedom,0);
  near(state(assembly).angleDegrees,-10);
});

test('interval crossing180degrees stays continuous through the quaternion wrap',()=>{
  const assembly=hinge({min:170,max:190});
  for(const angle of [170,179,180,181,190]){
    const result=setRotationLimitMateDrive(assembly,'lift',angle);
    assert.equal(result.ok,true,JSON.stringify(result));near(state(assembly).angleDegrees,angle);
  }
  const before=JSON.stringify(assembly);assert.equal(setRotationLimitMateDrive(assembly,'lift',191).ok,false);
  assert.equal(JSON.stringify(assembly),before);
});

test('common guide feed and whole-assembly rotation preserve captured relative angle',()=>{
  const assembly=hinge();assert.equal(setRotationLimitMateDrive(assembly,'lift',-15).ok,true);
  assembly.components[0].transform.y=-2;
  assert.equal(solveAssemblyMates(assembly).ok,true);near(state(assembly).angleDegrees,-15);
  const rotation=mul(axisAngleMatrix(p(0,0,1),.6),axisAngleMatrix(p(0,1),.4)),offset=p(8,-3,5);
  for(const component of assembly.components){
    const t=component.transform,position=apply(rotation,t);
    Object.assign(t,{x:position.x+offset.x,y:position.y+offset.y,z:position.z+offset.z});
    setRotation(t,mul(rotation,rotationOf(t)));
  }
  const before=assembly.components.map(c=>structuredClone(c.transform));
  assert.equal(solveAssemblyMates(assembly).ok,true);near(state(assembly).angleDegrees,-15);
  assembly.components.forEach((c,i)=>{for(const key of ['x','y','z'])near(c.transform[key],before[i][key]);});
});

test('invalid drive/range edits and invalid creation leave poses, mate state and history unchanged',()=>{
  const assembly=hinge();assert.equal(setRotationLimitMateDrive(assembly,'lift',-10).ok,true);
  const before=JSON.stringify(assembly);let history=0;
  for(const patch of [{driveAngle:1},{driveAngle:-21},{angleMin:1},{angleMax:-11},{angleMin:NaN},{reverse:'false'}]){
    assert.equal(setRotationLimitMateSettings(assembly,'lift',patch,()=>history++).ok,false);
    assert.equal(JSON.stringify(assembly),before);
  }
  const existing=assembly.topologyMates.at(-1);
  assert.equal(addRotationLimitMate(assembly,{...structuredClone(existing),id:'bad-range',angleMin:30,angleMax:0},()=>history++).ok,false);
  assert.equal(JSON.stringify(assembly),before);assert.equal(history,0);
});

test('reference replacement preserves component roles, driven pose and direction, rejects skew axes atomically',()=>{
  const assembly=hinge();assert.equal(setRotationLimitMateDrive(assembly,'lift',-10).ok,true);
  const a=ref('box','new-reader',p(-1),pivot),b=ref('clapper','new-moving',p(1),localPivot);
  let history=0;const result=setRotationLimitMateReferences(assembly,'lift',b,a,()=>history++);
  assert.equal(result.ok,true,JSON.stringify(result));near(rx(assembly),-10);near(state(assembly).angleDegrees,-10);
  assert.equal(assembly.topologyMates.at(-1).a.componentId,'box');assert.equal(history,1);
  const before=JSON.stringify(assembly);
  assert.equal(setRotationLimitMateReferences(assembly,'lift',a,ref('clapper','skew',p(0,1),localPivot),()=>history++).ok,false);
  assert.equal(JSON.stringify(assembly),before);assert.equal(history,1);
  assert.equal(setRotationLimitMateDrive(assembly,'lift',-15).ok,true);near(rx(assembly),-5);
});

test('native rotary study forward lift/reversal obeys directed backstop and failed seek is atomic',()=>{
  const assembly=hinge(),study=createMotionStudy(assembly);addRotaryMotor(study,'clapper',-1/3,p(1),localPivot);
  for(const time of [0,5,10,5,0]){
    const result=evaluateMotionStudy(assembly,study.id,time);
    assert.equal(result.ok,true,JSON.stringify(result));near(state(assembly).angleDegrees,-2*time);
    assert.equal(result.degreesOfFreedom,0);
  }
  const before=JSON.stringify(assembly);
  assert.equal(evaluateMotionStudy(assembly,study.id,11).ok,false);assert.equal(JSON.stringify(assembly),before);
  study.motors[0].rpm=1/3;const backward=JSON.stringify(assembly);
  assert.equal(evaluateMotionStudy(assembly,study.id,1).ok,false);assert.equal(JSON.stringify(assembly),backward);
});

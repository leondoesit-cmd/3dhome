import test from 'node:test';
import assert from 'node:assert/strict';
import {createMotionStudy,addRotaryMotor,evaluateMotionStudy} from '../js/cad_motion_study.js';
import {solveAssemblyMates} from '../js/cad_mate_solver.js';
import {apply,add,rotationOf,captureLockPose,topologyReference} from '../js/cad_mate_model.js';

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function offsetHinge(mirrored=false){
  const pivot={x:0,y:11.7,z:1.8};
  const jaw={id:'jaw',transform:{x:8.5,y:8.3,z:0,ry:mirrored?180:0}};
  const origin=add(jaw.transform,apply(rotationOf(jaw.transform),pivot));
  const pin={id:'pin',grounded:true,transform:{...origin}};
  const toe={id:'toe',transform:{x:8.5,y:24.5,z:mirrored?-.4:.4}};
  const axis={surface:'axis',axis:{x:1,y:0,z:0}};
  const rigid={id:'toe-lock',type:'lock',a:{componentId:jaw.id,kind:'body'},b:{componentId:toe.id,kind:'body'}};
  captureLockPose(rigid,jaw,toe);
  const assembly={components:[pin,jaw,toe],mates:[{id:'seat',type:'alignX',a:'pin',b:'jaw',value:0}],topologyMates:[
    {id:'hinge',type:'concentric',aligned:!mirrored,
      a:topologyReference('pin','axis','pin-axis',{...axis,origin:{x:0,y:0,z:0}}),
      b:topologyReference('jaw','axis','jaw-axis',{...axis,origin:pivot})},rigid]};
  assert.equal(solveAssemblyMates(assembly).ok,true);
  return {assembly,pivot,origin};
}
for(const mirrored of [false,true])test(`offset rotary hinge stays seated through seek and cold replay, mirrored=${mirrored}`,()=>{
  let {assembly,pivot,origin}=offsetHinge(mirrored);
  const initial=structuredClone(assembly.components);
  const study=createMotionStudy(assembly);
  addRotaryMotor(study,'jaw',15,{x:1,y:0,z:0},pivot);
  for(const time of [.5,1,0,1,.25,0]){
    const result=evaluateMotionStudy(assembly,study.id,time);
    assert.equal(result.ok,true,JSON.stringify(result));
    const jaw=assembly.components[1];
    const actual=add(jaw.transform,apply(rotationOf(jaw.transform),pivot));
    for(const key of ['x','y','z'])close(actual[key],origin[key]);
    assert.deepEqual(assembly.components[0],initial[0]);
    if(time===0)for(const key of ['x','y','z'])close(jaw.transform[key],initial[1].transform[key]);
    // Export/reopen must retain the original origin, not capture the moved pose.
    assembly=JSON.parse(JSON.stringify(assembly));
  }
});
test('invalid local rotary pivot leaves assembly and study baseline untouched',()=>{
  const {assembly}=offsetHinge(),study=createMotionStudy(assembly);
  addRotaryMotor(study,'jaw',15,{x:1,y:0,z:0},{x:0,y:Infinity,z:0});
  const before=structuredClone(assembly),result=evaluateMotionStudy(assembly,study.id,1);
  assert.equal(result.ok,false);assert.equal(result.issues[0].code,'invalid-motion-pivot');
  assert.deepEqual(assembly,before);
});
test('origin-only rotation cannot silently unseat a constrained offset hinge',()=>{
  const {assembly}=offsetHinge(),study=createMotionStudy(assembly);
  addRotaryMotor(study,'jaw',15,{x:1,y:0,z:0});
  const before=structuredClone(assembly.components),result=evaluateMotionStudy(assembly,study.id,1);
  assert.equal(result.ok,false);assert.ok(result.unsatisfied.some(issue=>issue.mate==='hinge'));
  assert.deepEqual(assembly.components,before);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {solveAssemblyMates} from '../js/cad_mate_solver.js';
import {captureLockPose,topologyReference,rotationOf,setRotation,eulerMatrix} from '../js/cad_mate_model.js';
import {createMotionStudy,addRotaryMotor,evaluateMotionStudy} from '../js/cad_motion_study.js';

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function lock(a,b,id='lock') {
  const mate={id,type:'lock',a:{componentId:a.id,kind:'body'},b:{componentId:b.id,kind:'body'}};
  captureLockPose(mate,a,b);return mate;
}
function shaftAssembly(reverse) {
  const components=[{id:'body',grounded:true,transform:{}},{id:'stem',transform:{}},
    {id:'disc',transform:{}},{id:'lever',transform:{y:7}},{id:'pin',transform:{y:7,z:1}}];
  const [body,stem,disc,lever,pin]=components;
  const axis={surface:'axis',origin:{x:0,y:0,z:0},axis:{x:0,y:1,z:0}};
  const pair=(a,b,id)=>reverse?lock(b,a,id):lock(a,b,id);
  return {components,mates:[{id:'axial',type:'alignY',a:body.id,b:stem.id,value:0}],topologyMates:[
    {id:'shaft',type:'concentric',aligned:true,a:topologyReference(body.id,'axis','body-axis',axis),b:topologyReference(stem.id,'axis','stem-axis',axis)},
    pair(stem,disc,'disc-lock'),pair(stem,lever,'lever-lock'),pair(lever,pin,'pin-lock')]};
}
for(const reverse of [false,true])test(`rigid shaft group retains one DOF and propagates motor with reversed picks=${reverse}`,()=>{
  const assembly=shaftAssembly(reverse),result=solveAssemblyMates(assembly);
  assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.degreesOfFreedom,1);
  const study=createMotionStudy(assembly);addRotaryMotor(study,'stem',15);
  for(const [time,degrees] of [[.5,45],[1,90],[0,0],[1,90]]) {
    const motion=evaluateMotionStudy(assembly,study.id,time);
    assert.equal(motion.ok,true,JSON.stringify(motion));
    for(const component of assembly.components.slice(1))close(component.transform.ry,degrees);
    close(assembly.components[3].transform.y,7);
    close(assembly.components[4].transform.x,Math.sin(degrees*Math.PI/180));
    close(assembly.components[4].transform.z,Math.cos(degrees*Math.PI/180));
    close(assembly.components[0].transform.ry,0);
  }
});
test('reverse-picked lock to grounded member restores both relative position and rotation',()=>{
  const moving={id:'moving',transform:{x:2,y:3,z:4,rx:20,ry:30,rz:40}},fixed={id:'fixed',grounded:true,transform:{x:5,ry:25}};
  const mate=lock(moving,fixed),expected=structuredClone(moving.transform);
  moving.transform={x:100,y:-30,z:70};
  const result=solveAssemblyMates({components:[moving,fixed],topologyMates:[mate]});
  assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.degreesOfFreedom,0);
  for(const key of ['x','y','z'])close(moving.transform[key],expected[key]);
  rotationOf(moving.transform).flat().forEach((value,i)=>close(value,rotationOf(expected).flat()[i]));
});
test('incompatible motors across reciprocal lock group fail without publishing partial movement',()=>{
  const assembly=shaftAssembly(true),study=createMotionStudy(assembly);
  addRotaryMotor(study,'stem',15);addRotaryMotor(study,'lever',10);
  const before=structuredClone(assembly.components);
  const result=evaluateMotionStudy(assembly,study.id,1);
  assert.equal(result.ok,false);assert.ok(result.unsatisfied.length);
  assert.deepEqual(assembly.components,before);
});
test('inconsistent lock cycle between grounded members remains diagnosed',()=>{
  const a={id:'a',grounded:true,transform:{}},b={id:'b',grounded:true,transform:{x:2}},c={id:'c',transform:{x:1}};
  const mates=[lock(a,c,'first'),lock(c,b,'second')];
  setRotation(b.transform,eulerMatrix({ry:45}));
  const result=solveAssemblyMates({components:[a,b,c],topologyMates:mates});
  assert.equal(result.ok,false);assert.ok(result.unsatisfied.length);
  close(a.transform.x,0);close(b.transform.x,2);close(b.transform.ry,45);
});
test('conflicting lock with both components grounded is measured instead of silently dropped',()=>{
  const a={id:'a',grounded:true,transform:{}},b={id:'b',grounded:true,transform:{x:2}},mate=lock(a,b);
  b.transform.x=3;
  const result=solveAssemblyMates({components:[a,b],topologyMates:[mate]});
  assert.equal(result.ok,false);assert.equal(result.unsatisfied[0].mate,'lock');close(b.transform.x,3);
});
test('shaft angle limits retain swing freedom and reject driven overshoot atomically',()=>{
  const assembly=shaftAssembly(true),front={surface:'plane',origin:{x:0,y:0,z:0},normal:{x:0,y:0,z:1}};
  assembly.topologyMates.push({id:'stops',type:'angle',aligned:true,value:0,angleMin:0,angleMax:90,
    a:topologyReference('body','face','front-a',front),b:topologyReference('stem','face','front-b',front)});
  const initial=solveAssemblyMates(assembly);
  assert.equal(initial.ok,true,JSON.stringify(initial));assert.equal(initial.degreesOfFreedom,1);
  const study=createMotionStudy(assembly);addRotaryMotor(study,'stem',15);
  assert.equal(evaluateMotionStudy(assembly,study.id,.5).ok,true);
  assert.equal(evaluateMotionStudy(assembly,study.id,1).ok,true);
  const before=structuredClone(assembly.components),result=evaluateMotionStudy(assembly,study.id,1.1);
  assert.equal(result.ok,false);assert.ok(result.unsatisfied.some(issue=>issue.mate==='stops'));
  assert.deepEqual(assembly.components,before);
});
test('an ungrounded rigid group has six collective freedoms in either pick order',()=>{
  for(const reverse of [false,true]) {
    const a={id:'a',transform:{x:2,ry:20}},b={id:'b',transform:{x:3,y:4,rz:15}};
    const result=solveAssemblyMates({components:[a,b],topologyMates:[reverse?lock(b,a):lock(a,b)]});
    assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.degreesOfFreedom,6);
  }
});
test('directional mates still refuse a grounded target',()=>{
  const axis={surface:'axis',origin:{x:0,y:0,z:0},axis:{x:0,y:1,z:0}};
  const assembly={components:[{id:'a',transform:{}},{id:'b',grounded:true,transform:{}}],topologyMates:[
    {id:'axis',type:'concentric',a:topologyReference('a','axis','a-axis',axis),b:topologyReference('b','axis','b-axis',axis)}]};
  const result=solveAssemblyMates(assembly);
  assert.equal(result.ok,false);assert.ok(result.issues.some(issue=>issue.code==='grounded-target'));
});

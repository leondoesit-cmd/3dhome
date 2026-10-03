import test from 'node:test';
import assert from 'node:assert/strict';
import {createMotionStudy,addLinearMotor,evaluateMotionStudy} from '../js/cad_motion_study.js';
import {captureLockPose,topologyReference} from '../js/cad_mate_model.js';

function slider(){
  const body={id:'body',grounded:true,transform:{}},rod={id:'rod',transform:{y:4.5}},seat={id:'seat',transform:{y:9}};
  const lock={id:'seat-lock',type:'lock',a:{componentId:'rod',kind:'body'},b:{componentId:'seat',kind:'body'}};
  captureLockPose(lock,rod,seat);
  const frame=normal=>({surface:'plane',origin:{x:0,y:0,z:0},normal});
  const ref=(id,normal)=>topologyReference(id,'face',id+JSON.stringify(normal),frame(normal));
  return {components:[body,rod,seat],mates:[],topologyMates:[lock,
    {id:'travel',type:'limit',aligned:true,min:3,max:4.5,a:ref('body',{x:0,y:1,z:0}),b:ref('rod',{x:0,y:1,z:0})},
    ...['x','z'].map(k=>({id:'guide-'+k,type:'coincident',aligned:true,a:ref('body',{x:k==='x'?1:0,y:0,z:k==='z'?1:0}),b:ref('rod',{x:k==='x'?1:0,y:0,z:k==='z'?1:0})}))]};
}
test('linear motor drives locked followers through travel limits and scrubs without drift',()=>{
  const assembly=slider(),study=createMotionStudy(assembly);addLinearMotor(study,'rod',-1.5,1,{x:0,y:1,z:0},true);
  for(const [time,y] of [[0,4.5],[.5,3.75],[1,3],[1.5,3.75],[2,4.5],[1,3],[0,4.5]]){
    const result=evaluateMotionStudy(assembly,study.id,time);assert.equal(result.ok,true,JSON.stringify(result));
    assert.ok(Math.abs(assembly.components[1].transform.y-y)<1e-6);
    assert.ok(Math.abs(assembly.components[2].transform.y-(y+4.5))<1e-6);
    assert.equal(assembly.components[0].transform.y||0,0);
  }
  const recovered=JSON.parse(JSON.stringify(assembly));
  assert.equal(evaluateMotionStudy(recovered,study.id,.5).ok,true);
  assert.ok(Math.abs(recovered.components[1].transform.y-3.75)<1e-6);
});
test('incompatible linear travel fails atomically instead of crossing a native end stop',()=>{
  const assembly=slider(),study=createMotionStudy(assembly);addLinearMotor(study,'rod',-2,1);
  const before=structuredClone(assembly);
  assert.equal(evaluateMotionStudy(assembly,study.id,1).ok,false);
  assert.deepEqual(assembly,before);
});
test('one-way linear travel holds its endpoint and clamps negative time to the saved start',()=>{
  const assembly=slider(),study=createMotionStudy(assembly);addLinearMotor(study,'rod',-1.5,2,{x:0,y:4,z:0});
  for(const [time,y] of [[1,3.75],[2,3],[200,3],[-1,4.5]]){
    assert.equal(evaluateMotionStudy(assembly,study.id,time).ok,true);
    assert.ok(Math.abs(assembly.components[1].transform.y-y)<1e-6);
  }
});
test('invalid duration, axis and grounded drive do not publish baselines or movement',()=>{
  for(const change of [m=>m.duration=0,m=>m.axis={x:0,y:0,z:0},m=>m.componentId='body']){
    const assembly=slider(),study=createMotionStudy(assembly),motor=addLinearMotor(study,'rod');change(motor);
    const before=structuredClone(assembly);assert.equal(evaluateMotionStudy(assembly,study.id,1).ok,false);assert.deepEqual(assembly,before);
  }
});

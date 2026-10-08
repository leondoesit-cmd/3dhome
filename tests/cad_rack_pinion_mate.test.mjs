import test from 'node:test';
import assert from 'node:assert/strict';
import {solveAssemblyMates} from '../js/cad_mate_solver.js';
import {topologyReference,mateFramesSupport,rotationOf,axisAngleMatrix,mul,setRotation,apply} from '../js/cad_mate_model.js';
import {rackPinionMateSpec} from '../js/cad_rack_pinion_mate.js';
import {addRackPinionMate,setRackPinionMateSettings,setRackPinionMateDrive,setRackPinionMateReferences} from '../js/cad_rack_pinion_controls.js';
import {createMotionStudy,addRackPinionMotor,evaluateMotionStudy} from '../js/cad_motion_study.js';

const p=(x=0,y=0,z=0)=>({x,y,z});
const ref=(id,name,axis,origin=p())=>topologyReference(id,'axis',name,{surface:'axis',origin,axis});
const plane=(id,name,normal)=>topologyReference(id,'face',name,{surface:'plane',origin:p(),normal});
function press({radius=1,reverse=false,axisSign=1,limit=true}={}) {
  const assembly={components:[
    {id:'base',grounded:true,transform:{...p(),rx:0,ry:0,rz:0}},
    {id:'pinion',transform:{...p(2.3,15),rx:0,ry:0,rz:0}},
    {id:'rack',transform:{...p(4.5,9),rx:0,ry:0,rz:0}},
  ],topologyMates:[
    {id:'bearing',type:'concentric',a:ref('base','shaft-seat',p(0,0,1),p(2.3,15)),b:ref('pinion','shaft',p(0,0,1))},
    {id:'axial-capture',type:'distance',value:0,aligned:true,a:plane('base','plane:front',p(0,0,1)),b:plane('pinion','plane:front',p(0,0,1))},
    {id:'guide-z',type:'distance',value:0,aligned:true,a:plane('base','plane:front',p(0,0,1)),b:plane('rack','plane:front',p(0,0,1))},
    {id:'guide-x',type:'distance',value:4.5,aligned:true,a:plane('base','plane:right',p(1)),b:plane('rack','plane:right',p(1))},
  ]};
  if(limit)assembly.topologyMates.push({id:'stop',type:'limit',min:3,max:9,aligned:true,a:plane('base','plane:top',p(0,1)),b:plane('rack','plane:top',p(0,1))});
  const result=addRackPinionMate(assembly,{id:'rack-drive',type:'rackpinion',pitchRadius:radius,reverse,
    a:ref('pinion','pinion-axis',p(0,0,1)),b:ref('rack','ram-socket-axis',p(0,axisSign))});
  assert.equal(result.ok,true,JSON.stringify(result));
  return assembly;
}
const rackY=assembly=>assembly.components.find(c=>c.id==='rack').transform.y;
const roll=assembly=>{const r=rotationOf(assembly.components.find(c=>c.id==='pinion').transform);return Math.atan2(r[1][0],r[0][0]);};
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} versus ${expected}`);

test('rack spec converts radius units and rejects invalid finite/range inputs',()=>{
  assert.deepEqual(rackPinionMateSpec(10,false,null,'mm'),{pitchRadius:1,reverse:false});
  for(const radius of [0,-1,NaN,Infinity])assert.equal(rackPinionMateSpec(radius),null);
  assert.equal(rackPinionMateSpec(1,'false'),null);
  assert.equal(rackPinionMateSpec(1,false,Infinity),null);
  assert.equal(mateFramesSupport('rackpinion',{origin:p(),axis:p(0,0,1)},{origin:p(),axis:p(0,1)}),true);
  assert.equal(mateFramesSupport('rackpinion',{origin:p(),axis:p(0,0,1)},{origin:p(),axis:p(0,0,1)}),false);
});

test('bearing and ram guides leave two freedoms; native rack coupling leaves one',()=>{
  const assembly=press();
  near(solveAssemblyMates(assembly).degreesOfFreedom,1);
  assembly.topologyMates.find(m=>m.type==='rackpinion').suppressed=true;
  near(solveAssemblyMates(assembly).degreesOfFreedom,2);
});

test('one-radian pinion rotation moves rack by pitch radius, with reverse and axis sign',()=>{
  for(const [radius,reverse,axisSign,turns,expectedY] of [[1,false,1,-1/(2*Math.PI),8],[2,false,1,-1/(2*Math.PI),7],[1,true,1,1/(2*Math.PI),8],[1,false,-1,1/(2*Math.PI),8]]){
    const assembly=press({radius,reverse,axisSign});
    const result=setRackPinionMateDrive(assembly,'rack-drive',turns);
    assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.degreesOfFreedom,0);
    near(rackY(assembly),expectedY);near(roll(assembly),2*Math.PI*turns);
  }
});

test('a prescribed rack translation drives the free pinion in the opposite direction',()=>{
  const assembly=press();
  assembly.components.find(c=>c.id==='rack').transform.y=8.5;
  const result=solveAssemblyMates(assembly,{fixedComponentIds:['rack']});
  assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.degreesOfFreedom,0);
  near(rackY(assembly),8.5);near(roll(assembly),-.5);
});

test('full multi-turn travel and cold JSON reopen preserve winding and zero',()=>{
  let assembly=press({limit:false});
  const result=setRackPinionMateDrive(assembly,'rack-drive',-2.25);
  assert.equal(result.ok,true,JSON.stringify(result));near(rackY(assembly),9-4.5*Math.PI);
  const zero=structuredClone(assembly.topologyMates.at(-1));
  for(let reopen=0;reopen<3;reopen++){
    assembly=JSON.parse(JSON.stringify(assembly));
    assert.equal(solveAssemblyMates(assembly).ok,true);near(rackY(assembly),9-4.5*Math.PI);
    near(assembly.topologyMates.at(-1).rackTravel0,zero.rackTravel0);
  }
});

test('60mm press end stop accepts exact endpoint and rejects overshoot atomically',()=>{
  const assembly=press(),turns=-6/(2*Math.PI);
  assert.equal(setRackPinionMateDrive(assembly,'rack-drive',turns).ok,true);near(rackY(assembly),3);
  const before=JSON.stringify(assembly);let history=0;
  const result=setRackPinionMateDrive(assembly,'rack-drive',-1,()=>history++);
  assert.equal(result.ok,false);assert.equal(history,0);assert.equal(JSON.stringify(assembly),before);
  assert.equal(setRackPinionMateDrive(assembly,'rack-drive',null).ok,true);
  assert.equal(solveAssemblyMates(assembly).degreesOfFreedom,1);
});

test('radius and reverse edits are transactional and invalid creation cannot move parts',()=>{
  const assembly=press();assert.equal(setRackPinionMateDrive(assembly,'rack-drive',-.25).ok,true);
  let commits=0;
  assert.equal(setRackPinionMateSettings(assembly,'rack-drive',{pitchRadius:2},()=>commits++).ok,true);
  near(rackY(assembly),9-Math.PI);assert.equal(commits,1);
  const before=JSON.stringify(assembly);
  assert.equal(setRackPinionMateSettings(assembly,'rack-drive',{reverse:true},()=>commits++).ok,false);
  assert.equal(JSON.stringify(assembly),before);assert.equal(commits,1);
  const original=structuredClone(assembly.topologyMates.find(m=>m.type==='rackpinion'));
  assert.equal(addRackPinionMate(assembly,{...original,id:'invalid-new-rack',pitchRadius:0}).ok,false);
  assert.equal(JSON.stringify(assembly),before);
});

test('native axis centroid changes do not alter component-origin travel zero',()=>{
  const assembly=press(),mate=assembly.topologyMates.find(m=>m.type==='rackpinion');
  assert.equal(setRackPinionMateDrive(assembly,mate.id,-.25).ok,true);
  const before=rackY(assembly),zero=mate.rackTravel0;
  mate.b.frame.origin.y=25;mate.b.descriptor.origin.y=25;
  assert.equal(solveAssemblyMates(assembly).ok,true);near(rackY(assembly),before);near(mate.rackTravel0,zero);
});

test('rigid placement of the entire press preserves its joint zero and driven pose',()=>{
  const assembly=press();assert.equal(setRackPinionMateDrive(assembly,'rack-drive',-.25).ok,true);
  const turn=mul(axisAngleMatrix(p(0,0,1),.7),axisAngleMatrix(p(1),.4)),offset=p(12,-3,8);
  for(const component of assembly.components){
    const t=component.transform,position=apply(turn,t);
    Object.assign(t,{x:position.x+offset.x,y:position.y+offset.y,z:position.z+offset.z});
    setRotation(t,mul(turn,rotationOf(t)));
  }
  const before=assembly.components.map(c=>structuredClone(c.transform));
  const result=solveAssemblyMates(assembly);
  assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.degreesOfFreedom,0);
  assembly.components.forEach((c,i)=>{
    for(const key of ['x','y','z'])near(c.transform[key],before[i][key]);
    rotationOf(c.transform).flat().forEach((v,j)=>near(v,rotationOf(before[i]).flat()[j]));
  });
});

test('rack motor seeks, reverses and refreshes the free bounded press',()=>{
  const assembly=press(),study=createMotionStudy(assembly),motor=addRackPinionMotor(study,'rack-drive',-6/(2*Math.PI)*6);
  for(const time of [0,2,5,10,5,0]){
    const result=evaluateMotionStudy(assembly,study.id,time);
    assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.degreesOfFreedom,0);
    near(rackY(assembly),9-.6*time);
    assert.equal(solveAssemblyMates(assembly).degreesOfFreedom,1);
  }
  const before=JSON.stringify(assembly);
  assert.equal(evaluateMotionStudy(assembly,study.id,11).ok,false);assert.equal(JSON.stringify(assembly),before);
  assert.ok(Number.isFinite(motor.baseTurns));
});

test('validated incremental zero-RPM rack motor keeps a defined solve result',()=>{
  const assembly=press(),study=createMotionStudy(assembly);addRackPinionMotor(study,'rack-drive',0);
  for(const time of [0,1,2])assert.equal(evaluateMotionStudy(assembly,study.id,time,{incremental:true}).ok,true);
  near(rackY(assembly),9);
});

test('rack motor preserves multiple complete revolutions across random and incremental seeks',()=>{
  const assembly=press({limit:false}),study=createMotionStudy(assembly);
  addRackPinionMotor(study,'rack-drive',-60);
  for(const [time,incremental] of [[0,true],[.25,true],[.5,true],[2.25,false],[.75,false],[1,true]]){
    const result=evaluateMotionStudy(assembly,study.id,time,{incremental});
    assert.equal(result.ok,true,JSON.stringify(result));near(rackY(assembly),9-2*Math.PI*time);
    assert.equal(solveAssemblyMates(assembly).degreesOfFreedom,1);
  }
});

test('unsupported rack motor and nonfinite speed reject without altering assembly or study',()=>{
  for(const configure of [motor=>{motor.mateId='missing';},motor=>{motor.rpm=Infinity;}]){
    const assembly=press(),study=createMotionStudy(assembly),motor=addRackPinionMotor(study,'rack-drive',-60);
    configure(motor);const before=JSON.stringify(assembly);
    assert.equal(evaluateMotionStudy(assembly,study.id,1).ok,false);assert.equal(JSON.stringify(assembly),before);
  }
});

test('replacing rack references recaptures the saved driven pose and rejects invalid picks atomically',()=>{
  const assembly=press();assert.equal(setRackPinionMateDrive(assembly,'rack-drive',-.25).ok,true);
  const beforeY=rackY(assembly);let commits=0;
  const a=ref('pinion','repaired-pinion-axis',p(0,0,1)),b=ref('rack','repaired-rack-axis',p(0,-1));
  const result=setRackPinionMateReferences(assembly,'rack-drive',b,a,()=>commits++);
  assert.equal(result.ok,true,JSON.stringify(result));assert.equal(commits,1);
  near(rackY(assembly),beforeY);near(roll(assembly),-Math.PI/2);
  const mate=assembly.topologyMates.find(m=>m.type==='rackpinion');
  assert.equal(mate.a.persistentId,a.persistentId);assert.equal(mate.b.persistentId,b.persistentId);
  const before=JSON.stringify(assembly);
  assert.equal(setRackPinionMateReferences(assembly,mate.id,a,ref('rack','invalid-skew-axis',p(0,0,1)),()=>commits++).ok,false);
  assert.equal(JSON.stringify(assembly),before);assert.equal(commits,1);
  assert.equal(setRackPinionMateDrive(assembly,mate.id,-.2).ok,true);
  near(rackY(assembly),beforeY-.1*Math.PI);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {generatedRackGear,rackGearSpec,validateGearPair} from '../js/cad_gear_geometry.js';
import {gearToleranceEnvelope} from '../js/cad_gear_validation.js';
import {createMotionStudy,addRotaryMotor,addGearRelation,evaluateMotionStudy} from '../js/cad_motion_study.js';
import {rotationOf,axisAngleMatrix,mul} from '../js/cad_mate_model.js';
import {makeBrepExtrusion,shapeMassProperties,disposeBrep,exportStep,importStep} from '../js/cad_kernel.js';
const near=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const gear=(teeth,profileShift=0)=>({moduleMm:2,teeth,profileShift,allowUndercut:true});
const area=points=>Math.abs(points.reduce((s,p,i)=>{const q=points[(i+1)%points.length];return s+p.u*q.v-q.u*p.v;},0)/2);
test('undercut is explicit; generated roots remain continuous near the undercut threshold',()=>{
 assert.throws(()=>generatedRackGear({...gear(14),allowUndercut:false}),/undercut/);
 for(const z of [5,10,14,16,17,18,20]){
  const g=generatedRackGear(gear(z)),s=g.spec;
  assert.equal(g.undercut,z<18);assert.ok(g.points.every(p=>Number.isFinite(p.u)&&Number.isFinite(p.v)));
  near(Math.min(...g.points.map(p=>10*Math.hypot(p.u,p.v))),s.rf);
  near(Math.max(...g.points.map(p=>10*Math.hypot(p.u,p.v))),s.ra);
  assert.ok(g.rootJoinRadiusMm>=s.rb);assert.ok(area(g.points)>Math.PI*(s.rf/10)**2);
 }
});
test('shifted pinion has independent pitch thickness and working-center checks',()=>{
 const a=gear(10,.5),b=gear(40),g=generatedRackGear(a),s=g.spec;
 assert.equal(g.undercut,false);near(s.ra,13);near(s.rf,8.5);
 // Cutter space decreases by 2*x*m*tan(alpha), increasing tooth thickness.
 near(2*(rackGearSpec(gear(10)).half-s.half),2*.5*2*Math.tan(20*Math.PI/180));
 const pair=validateGearPair(a,b);assert.equal(pair.ok,true,JSON.stringify(pair));
 const aw=pair.workingPressureAngleDeg*Math.PI/180,alpha=20*Math.PI/180;
 near(Math.tan(aw)-aw,Math.tan(alpha)-alpha+2*.5*Math.tan(alpha)/50);
 near(pair.centerDistanceMm,50*Math.cos(alpha)/Math.cos(aw));assert.ok(pair.centerDistanceMm>50);
 const envelope=gearToleranceEnvelope({...a,backlashMm:.1},{...b,backlashMm:.1},{centerToleranceMm:0,driverToothToleranceMm:0,mateToothToleranceMm:0});
 near(envelope.minimumBacklashMm,pair.centerDistanceMm/50*.1);
 assert.equal(validateGearPair(gear(10),gear(40)).ok,false);
});
test('undercut and shifted outlines produce native solids with preserved STEP volume', {timeout:120000},async()=>{
 for(const spec of [gear(10),gear(17),gear(10,.5)]){
  const g=generatedRackGear(spec);let body,restored;
  try{body=await makeBrepExtrusion({points:g.points,axis:'y',from:0,to:.8});const mass=await shapeMassProperties(body);near(mass.volume,area(g.points)*.8,1e-5);
   if(spec.profileShift){restored=await importStep(await exportStep(body,'shifted.step'),'shifted.step');near((await shapeMassProperties(restored)).volume,mass.volume,1e-5);}
  }finally{disposeBrep(restored);disposeBrep(body);}
 }
});
const assembly=()=>({components:['a','b','c'].map((id,i)=>({id,transform:{x:i*5,rx:13,ry:7,rz:11}}))});
const zAxis={x:0,y:0,z:1};
test('gear ratios propagate full turns, chains, reversal and saved random seeks',()=>{
 const a=assembly(),base=rotationOf(a.components[1].transform),s=createMotionStudy(a);addRotaryMotor(s,'a',60,zAxis);
 addGearRelation(s,'a','b',{driverTeeth:20,followerTeeth:40,driverAxis:zAxis,followerAxis:zAxis});
 addGearRelation(s,'b','c',{driverTeeth:30,followerTeeth:10,mesh:'internal',driverAxis:zAxis,followerAxis:zAxis});
 for(const time of [1,4,-.25,0,2.75]){
  const r=evaluateMotionStudy(a,s.id,time);assert.equal(r.ok,true,JSON.stringify(r));
  near(r.motions.find(m=>m.componentId==='b').angleDeg,-180*time);
  near(r.motions.find(m=>m.componentId==='c').angleDeg,-540*time);
  const expected=mul(axisAngleMatrix(zAxis,(-180*time%360)*Math.PI/180),base),actual=rotationOf(a.components[1].transform);
  expected.flat().forEach((v,i)=>near(actual.flat()[i],v));near(a.components[1].transform.x,5);
 }
 const restored=JSON.parse(JSON.stringify(a));assert.equal(evaluateMotionStudy(restored,s.id,1).ok,true);
 assert.equal(evaluateMotionStudy(a,s.id,1).ok,true);assert.deepEqual(restored.components,a.components);
});
test('gear failures are transactional, including conflicting cycles at time zero',()=>{
 for(const failure of ['cycle','grounded','axis','missing','undriven','motor']){
  const a=assembly(),s=createMotionStudy(a);addRotaryMotor(s,'a',60,zAxis);
  addGearRelation(s,'a','b',{driverAxis:zAxis,followerAxis:zAxis});
  if(failure==='cycle'){addGearRelation(s,'b','c',{driverAxis:zAxis,followerAxis:zAxis});addGearRelation(s,'c','a',{driverAxis:zAxis,followerAxis:zAxis});}
  if(failure==='grounded')a.components[1].grounded=true;
  if(failure==='axis')s.gearRelations[0].driverAxis={x:1,y:0,z:0};
  if(failure==='missing')s.gearRelations[0].followerId='lost';
  if(failure==='undriven')s.motors=[];
  if(failure==='motor')addRotaryMotor(s,'b',60,zAxis);
  const before=structuredClone(a);assert.equal(evaluateMotionStudy(a,s.id,0).ok,false,failure);assert.deepEqual(a,before,failure);
 }
});

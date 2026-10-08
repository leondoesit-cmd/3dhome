import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {captureMotionStudyBaseline,createMotionStudy,evaluateMotionStudy} from '../js/cad_motion_study.js';
import {solveAssemblyMates} from '../js/cad_mate_solver.js';
import {rotationOf} from '../js/cad_mate_model.js';
const saved=JSON.parse(readFileSync(new URL('./fixtures/shaper-head-browser-native-mates.json',import.meta.url),'utf8'));
const angle=a=>{const r=rotationOf(a.components.find(c=>c.id===5259).transform);return Math.atan2(r[2][1],r[1][1])*180/Math.PI;};
function recaptured(){
  const a=structuredClone(saved),feed=a.motionStudies[0],clapper=a.motionStudies[1],fm=a.topologyMates.find(m=>m.id===5276),hm=a.topologyMates.find(m=>m.id===5283);
  hm.driveAngle=0;captureMotionStudyBaseline(a,feed);delete hm.driveAngle;
  fm.driveTurns=0;captureMotionStudyBaseline(a,clapper);delete fm.driveTurns;
  return a;
}
test('actual legacy pose-only studies retain live configuration until explicit recapture',()=>{
  const a=structuredClone(saved),study=a.motionStudies[0];assert.equal(Object.hasOwn(study,'nativeDriveConfiguration'),false);
  const result=evaluateMotionStudy(a,study.id,10);assert.equal(result.ok,true);assert.ok(angle(a)<-1);
  assert.equal(Object.hasOwn(study,'nativeDriveConfiguration'),false);
});
test('actual two studies keep separately captured native actuator constraints after final assembly returns free',()=>{
  const a=recaptured(),globalMates=JSON.stringify(a.topologyMates);
  assert.equal(solveAssemblyMates(a).degreesOfFreedom,2);
  for(const [study,expectedY,expectedAngle] of [[a.motionStudies[0],-2,0],[a.motionStudies[1],0,-20]])for(const time of [0,10]){
    const cold=JSON.parse(JSON.stringify(a)),r=evaluateMotionStudy(cold,study.id,time);
    assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.settled,true);assert.equal(r.degreesOfFreedom,0);
    assert.ok(Math.abs(cold.components.find(c=>c.id===5247).transform.y-(time?expectedY:0))<1e-8);
    assert.ok(Math.abs(angle(cold)-(time?expectedAngle:0))<1e-8);
    assert.equal(JSON.stringify(cold.topologyMates),globalMates);
    const refresh=solveAssemblyMates(cold);assert.equal(refresh.ok,true);assert.equal(refresh.settled,true);assert.equal(refresh.degreesOfFreedom,2);
  }
});
test('actual Chrome recaptured study records cold seek correctly while their saved assembly remains free',()=>{
  for(const index of [0,1])for(const time of [0,10]){
    const a=structuredClone(saved);a.motionStudies=structuredClone(saved.recapturedMotionStudies);
    const study=a.motionStudies[index],before=JSON.stringify(a.topologyMates),r=evaluateMotionStudy(a,study.id,time);
    assert.equal(r.ok,true);assert.equal(r.settled,true);assert.equal(r.degreesOfFreedom,0);
    assert.ok(Math.abs(angle(a)-(index&&time?-20:0))<1e-8);
    assert.ok(Math.abs(a.components.find(c=>c.id===5247).transform.y-(!index&&time?-2:0))<1e-8);
    assert.equal(JSON.stringify(a.topologyMates),before);
    assert.equal(solveAssemblyMates(a).degreesOfFreedom,2);
  }
});
test('new studies capture native Drive state and their motors override their own captured Drive',()=>{
  const a=structuredClone(saved);a.topologyMates.find(m=>m.id===5283).driveAngle=0;
  const study=createMotionStudy(a,'new captured study');study.motors=structuredClone(a.motionStudies[0].motors);
  a.topologyMates.find(m=>m.id===5276).driveTurns=3;delete a.topologyMates.find(m=>m.id===5283).driveAngle;
  const before=JSON.stringify(a.topologyMates),r=evaluateMotionStudy(a,study.id,10);
  assert.equal(r.ok,true);assert.equal(r.degreesOfFreedom,0);assert.ok(Math.abs(angle(a))<1e-8);assert.ok(Math.abs(a.components.find(c=>c.id===5247).transform.y+2)<1e-8);assert.equal(JSON.stringify(a.topologyMates),before);
});
test('stale malformed duplicate and impossible captured native configurations reject atomically',()=>{
  for(const mutate of [s=>s.nativeDriveConfiguration[0].mateId='missing',s=>s.nativeDriveConfiguration[0].field='wrong',s=>s.nativeDriveConfiguration.push(structuredClone(s.nativeDriveConfiguration[0])),s=>s.nativeDriveConfiguration.find(c=>c.type==='rotationlimit').value=1]){
    const a=recaptured(),s=a.motionStudies[0];mutate(s);const before=JSON.stringify(a),r=evaluateMotionStudy(a,s.id,10);assert.equal(r.ok,false);assert.equal(JSON.stringify(a),before);
  }
});

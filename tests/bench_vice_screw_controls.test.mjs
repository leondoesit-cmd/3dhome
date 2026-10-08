import test from 'node:test';
import assert from 'node:assert/strict';
import {topologyReference,solveTopologyMates} from '../js/cad_mates.js';
import {createMotionStudy,addScrewMotor,evaluateMotionStudy} from '../js/cad_motion_study.js';
import {setScrewMateHandedness,setScrewMateDrive,setScrewMateCoupledMotion} from '../js/cad_screw_controls.js';
import {readFileSync} from 'node:fs';

const transform=()=>({x:0,y:0,z:0,rx:0,ry:0,rz:0});
const point=(x,y,z)=>({x,y,z});
const axis=point(1,0,0);
const cylinder=(id)=>topologyReference(id,'face',id+'-axis',{surface:'cylinder',origin:point(0,3.4,0),axis,radius:1});
const datum=(id,normal)=>topologyReference(id,'face',id+JSON.stringify(normal),{surface:'plane',origin:point(0,0,0),normal});
function vice(handedness='rh') {
 const assembly={components:['base','shaft','jaw'].map(id=>({id,grounded:id==='base',transform:transform()})),topologyMates:[
  {id:'journal',type:'concentric',a:cylinder('base'),b:cylinder('shaft')},
  {id:'axial-seat',type:'distance',value:0,aligned:true,a:datum('base',axis),b:datum('shaft',axis)},
  {id:'jaw-top',type:'distance',value:0,aligned:true,a:datum('base',point(0,1,0)),b:datum('jaw',point(0,1,0))},
  {id:'jaw-front',type:'distance',value:0,aligned:true,a:datum('base',point(0,0,1)),b:datum('jaw',point(0,0,1))},
  {id:'thread',type:'screw',coupledMotion:true,pitch:.4,handedness,a:cylinder('shaft'),b:cylinder('jaw')},
  {id:'end-stops',type:'limit',min:0,max:5,aligned:true,a:datum('base',axis),b:datum('jaw',axis)},
 ]};
 assert.equal(solveTopologyMates(assembly).ok,true);
 return assembly;
}

test('thread handedness control preserves captured axial zero, phase and winding atomically',()=>{
 const mate={type:'screw',coupledAxial0:2,coupledPhase0:.7,coupledAxialBasis:'component-origin',driveTurns:3};
 const before=structuredClone(mate);
 assert.equal(setScrewMateHandedness(mate,'bogus'),false);
 assert.deepEqual(mate,before);
 assert.equal(setScrewMateHandedness(mate,'lh'),true);
 assert.deepEqual(mate,{...before,handedness:'lh'});
 assert.deepEqual(JSON.parse(JSON.stringify(mate)),mate);
});

test('guided vice screw advances 4 mm per revolution across 12.5 turns and rejects both end-stop overshoots',()=>{
 const assembly=vice();
 assert.equal(solveTopologyMates(assembly).degreesOfFreedom,1);
 const study=createMotionStudy(assembly);
 addScrewMotor(study,'thread',60);
 for(const [turns,mm] of [[0,0],[2.5,10],[6.25,25],[10,40],[12.5,50],[0,0]]){
  const result=evaluateMotionStudy(assembly,study.id,turns);
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.ok(Math.abs(assembly.components[2].transform.x*10-mm)<1e-4);
  assert.ok(Math.abs(assembly.components[1].transform.x)<1e-7,'shaft stays axially seated');
 }
 const before=JSON.stringify(assembly.components);
 for(const time of [-.25,12.75]){
  const result=evaluateMotionStudy(assembly,study.id,time);
  assert.equal(result.ok,false,'travel outside 0..50 mm must fail');
  assert.equal(JSON.stringify(assembly.components),before,'failed travel never publishes partial poses');
 }
});

test('left hand signed motor reverses winding and retains positive jaw advance after reopen',()=>{
 const assembly=vice();
 assert.equal(setScrewMateHandedness(assembly.topologyMates.find(m=>m.id==='thread'),'lh'),true);
 const reopened=JSON.parse(JSON.stringify(assembly));
 const study=createMotionStudy(reopened);addScrewMotor(study,'thread',-60);
 const result=evaluateMotionStudy(reopened,study.id,2.5);
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.ok(Math.abs(reopened.components[2].transform.x-1)<1e-5);
 assert.equal(reopened.topologyMates.find(m=>m.id==='thread').coupledAxial0,0);
});

const browserVice=()=>JSON.parse(readFileSync(new URL('./fixtures/bench-vice-browser-native-mates.json',import.meta.url),'utf8'));
test('actual browser vice recouples at its saved phase and drives signed guided travel',()=>{
 const assembly=browserVice(),mate=assembly.topologyMates.find(m=>m.type==='screw');
 // The browser export had a wrongly captured centroid zero labelled as an
 // origin zero. Recreating the coupled joint at home explicitly clears it.
 for(const key of ['coupledAxial0','coupledPhase0','coupledAxialBasis'])delete mate[key];
 const jaw=assembly.components.find(c=>c.id===4021),home=structuredClone(jaw.transform);
 assert.equal(solveTopologyMates(assembly).ok,true);
 assert.ok(Math.abs(mate.coupledAxial0+home.x)<1e-7);
 assert.ok(Math.abs(mate.coupledPhase0+2.984515034984657)<1e-7);
 setScrewMateHandedness(mate,'lh');
 let commits=0;
 for(const turns of [.25,.5,.75,1,0]){
  const result=setScrewMateDrive(assembly,mate.id,turns,()=>{commits++;});
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.ok(Math.abs(jaw.transform.x-home.x-.4*turns)<1e-5);
  for(const key of ['y','z','rx','ry','rz'])assert.ok(Math.abs(jaw.transform[key]-home[key])<1e-5,key);
 }
 assert.equal(commits,5);
 const before=structuredClone(assembly);
 const result=setScrewMateDrive(assembly,mate.id,-1,()=>{commits++;});
 assert.equal(result.ok,false,'drive outside the native end stop is rejected');
 assert.deepEqual(assembly,before,'failure preserves mate, follower poses and zero');
 assert.equal(commits,5,'failed requests do not create undo entries');
});

test('actual browser vice with stale zero rejects a requested drive atomically',()=>{
 const assembly=browserVice(),mate=assembly.topologyMates.find(m=>m.type==='screw');
 const before=structuredClone(assembly);
 assert.equal(setScrewMateDrive(assembly,mate.id,1).ok,false);
 assert.deepEqual(assembly,before);
});

test('first direct drive captures an uncaptured browser joint before moving',()=>{
 const assembly=browserVice(),mate=assembly.topologyMates.find(m=>m.type==='screw');
 for(const key of ['coupledAxial0','coupledPhase0','coupledAxialBasis'])delete mate[key];
 setScrewMateHandedness(mate,'lh');
 const jaw=assembly.components.find(c=>c.id===4021),start=jaw.transform.x;
 const result=setScrewMateDrive(assembly,mate.id,1);
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.ok(Math.abs(jaw.transform.x-start-.4)<1e-5);
});

test('native new screw captures home without moving unequal axis centroids',()=>{
 const assembly=browserVice(),mate=assembly.topologyMates.find(m=>m.type==='screw');
 for(const key of ['coupledAxial0','coupledPhase0','coupledAxialBasis'])delete mate[key];
 assert.equal(mate.a.frame.origin.x,8.91);
 assert.equal(mate.b.frame.origin.x,10.3);
 const before=assembly.components.map(c=>structuredClone(c.transform));
 const result=solveTopologyMates(assembly);
 assert.equal(result.ok,true,JSON.stringify(result));
 assembly.components.forEach((c,i)=>{
  for(const key of ['x','y','z','rx','ry','rz'])assert.ok(Math.abs(c.transform[key]-before[i][key])<1e-5);
 });
 assert.ok(Math.abs(mate.coupledAxial0)<1e-5,'axis centroid delta never becomes component-origin zero');
 const saved=structuredClone(assembly);let commits=0;
 assert.equal(setScrewMateCoupledMotion(assembly,mate.id,false,()=>{commits++;}).ok,false,
  'legacy centroid prescription contradicts the guided home');
 assert.deepEqual(assembly,saved);
 assert.equal(commits,0);
});

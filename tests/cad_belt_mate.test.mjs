import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {beltMateSpec,beltRatio,beltDiameterValue} from '../js/cad_belt_mate.js';
import {solveTopologyMates,topologyReference} from '../js/cad_mates.js';
import {screwRoll,mateRequirementFor,mateFramesSupport} from '../js/cad_mate_model.js';
import {createMotionStudy,addRotaryMotor,evaluateMotionStudy} from '../js/cad_motion_study.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('actual Belt form creates semantic canonical data and rejects invalid input',()=>{
  const source=modelerSource();
  const form=source.slice(source.indexOf('function openMateBeltForm()'),source.indexOf('function openMateDistanceForm()'));
  let specification,created;
  const context={beltMateSpec,t:key=>key,flash:()=>{},openQuickForm:spec=>{specification=spec;},
    addTopologyMate:(type,spec)=>{created={type,...spec};return true;}};
  vm.runInNewContext(form+';openMateBeltForm();',context);
  assert.deepEqual(Array.from(specification.fields.filter(f=>f.unit==='length'),f=>f.key),['diameterA','diameterB']);
  // Quick-form length controls return canonical cm after mm/in conversion.
  assert.equal(specification.onApply({diameterA:6,diameterB:9,direction:'crossed'}),true);
  assert.deepEqual(created,{type:'belt',diameterA:6,diameterB:9,beltDirection:'crossed'});
  assert.equal(specification.onApply({diameterA:Infinity,diameterB:9,direction:'open'}),false);
  assert.equal(created.beltDirection,'crossed','a rejected form must not create a replacement');
});

test('effective diameters convert document units without persisting tooth counts',()=>{
  const metric=beltMateSpec(60,90,'open','mm'),inch=beltMateSpec(60/25.4,90/25.4,'open','in');
  assert.equal(metric.diameterA,6);assert.equal(metric.diameterB,9);
  assert.ok(Math.abs(inch.diameterA-metric.diameterA)<1e-12);
  assert.equal(beltRatio(metric),2/3);
  assert.equal(beltDiameterValue(metric,'a','mm'),60);
  assert.ok(Math.abs(beltDiameterValue(metric,'b','in')-90/25.4)<1e-12);
  for(const args of [[0,2],[-1,2],[Infinity,2],[2,NaN],[2,3,'unknown'],[1e308,1e-308]])assert.equal(beltMateSpec(...args),null);
  assert.equal(beltRatio({diameterA:0,diameterB:1,beltDirection:'open'}),null);
  assert.equal(mateRequirementFor('belt'),'axis');
  assert.equal(mateFramesSupport('belt',cylinder(),{...cylinder(),axis:{x:1,y:0,z:0}}),false);
});

const axis={x:0,y:0,z:1},zero={x:0,y:0,z:0};
const cylinder=(x=0)=>({surface:'cylinder',origin:{x,y:0,z:0},axis,radius:1});
const plane=(x=0)=>({surface:'plane',origin:{x,y:0,z:0},normal:axis});
const ref=(id,key,frame)=>topologyReference(id,'face',key,frame);
function mechanism(direction){
  const components=[{id:'base',grounded:true,transform:{}},{id:'a',transform:{}},{id:'b',transform:{x:10}}];
  const topologyMates=[];
  for(const [id,x] of [['a',0],['b',10]]){
    topologyMates.push({id:'axis'+id,type:'concentric',a:ref('base','bore'+id,cylinder(x)),b:ref(id,'shaft',cylinder())});
    topologyMates.push({id:'seat'+id,type:'distance',value:0,aligned:true,a:ref('base','seat'+id,plane(x)),b:ref(id,'cap',plane())});
  }
  topologyMates.push({id:'belt',type:'belt',...beltMateSpec(60,90,direction,'mm'),
    a:ref('a','axis',cylinder()),b:ref('b','axis',cylinder())});
  return {components,topologyMates};
}
const degrees=part=>screwRoll(part,axis)*180/Math.PI;
for(const [direction,sign] of [['open',1],['crossed',-1]])test(`${direction} belt couples native rotary joints at diameter ratio and survives reopen`,()=>{
  let assembly=mechanism(direction);
  let result=solveTopologyMates(assembly);
  assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.degreesOfFreedom,1);
  const phase=assembly.topologyMates[4];assert.ok(Number.isFinite(phase.rollA0));
  assembly=JSON.parse(JSON.stringify(assembly));
  assert.equal(assembly.topologyMates[4].type,'belt');assert.equal(assembly.topologyMates[4].beltDirection,direction);
  assert.equal(assembly.topologyMates[4].ratioA,undefined);
  for(const drive of [30,90,-45]){
    assembly.components[1].transform.rz=drive;delete assembly.components[1].transform.q;
    result=solveTopologyMates(assembly,{fixedComponentIds:['a']});
    assert.equal(result.ok,true,JSON.stringify(result));
    assert.ok(Math.abs(degrees(assembly.components[2])-sign*drive*2/3)<1e-4);
    assert.ok(Math.abs(assembly.components[2].transform.x-10)<1e-7);
    assert.ok(Math.abs(assembly.components[2].transform.z)<1e-7);
  }
});

test('rotary motion study uses the persisted belt mate without a separate gear relation',()=>{
  const assembly=mechanism('open');assert.equal(solveTopologyMates(assembly).ok,true);
  const study=createMotionStudy(assembly);addRotaryMotor(study,'a',5,axis);
  assert.equal(evaluateMotionStudy(assembly,study.id,1).ok,true);
  assert.ok(Math.abs(degrees(assembly.components[1])-30)<1e-4);
  assert.ok(Math.abs(degrees(assembly.components[2])-20)<1e-4);
  const reopened=JSON.parse(JSON.stringify(assembly));
  assert.equal(evaluateMotionStudy(reopened,study.id,2).ok,true);
  assert.ok(Math.abs(degrees(reopened.components[2])-40)<1e-4);
});

for(const [direction,sign] of [['open',1],['crossed',-1]])test(`${direction} 2:3 belt seeks multiple motor turns and reopens without losing winding`,()=>{
  let assembly=mechanism(direction);assert.equal(solveTopologyMates(assembly).ok,true);
  const study=createMotionStudy(assembly);addRotaryMotor(study,'a',60,axis);
  for(const seconds of [1,2,5.5,-3,0,12]){
    const result=evaluateMotionStudy(assembly,study.id,seconds);
    assert.equal(result.ok,true,JSON.stringify(result));
    const expected=sign*seconds*360*2/3;
    const error=((degrees(assembly.components[2])-expected+540)%360+360)%360-180;
    assert.ok(Math.abs(error)<1e-4,`${seconds}s follower angle ${degrees(assembly.components[2])}, expected ${expected}`);
    assert.ok(Math.abs(assembly.topologyMates[4].beltTurnA-seconds*2*Math.PI)<1e-9);
    assembly=JSON.parse(JSON.stringify(assembly));
    const reopened=solveTopologyMates(assembly);
    assert.equal(reopened.ok,true,JSON.stringify(reopened));
    const after=((degrees(assembly.components[2])-expected+540)%360+360)%360-180;
    assert.ok(Math.abs(after)<1e-4,'ordinary cold solve preserves the full-turn motor phase');
  }
});

test('manual incremental belt motion unwraps phase across the Euler seam',()=>{
  let assembly=mechanism('open');solveTopologyMates(assembly);
  for(let angle=60;angle<=720;angle+=60){
    assembly.components[1].transform.rz=angle%360;delete assembly.components[1].transform.q;
    assert.equal(solveTopologyMates(assembly,{fixedComponentIds:['a']}).ok,true);
    const expected=angle*2/3,error=((degrees(assembly.components[2])-expected+540)%360+360)%360-180;
    assert.ok(Math.abs(error)<1e-4);
    assembly=JSON.parse(JSON.stringify(assembly));
  }
  assert.ok(Math.abs(assembly.topologyMates[4].beltTurnA-4*Math.PI)<1e-9);
});

test('unsupported skew motor axis fails atomically without publishing belt phase or study baseline',()=>{
  const assembly=mechanism('open');solveTopologyMates(assembly);
  const study=createMotionStudy(assembly);addRotaryMotor(study,'a',60,{x:1,y:0,z:0});
  const before=JSON.stringify(assembly),result=evaluateMotionStudy(assembly,study.id,5);
  assert.equal(result.ok,false);assert.equal(result.issues[0].code,'invalid-belt-motor-axis');
  assert.equal(JSON.stringify(assembly),before);
});

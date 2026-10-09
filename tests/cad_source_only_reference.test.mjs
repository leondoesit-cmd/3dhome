import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {currentNativeFixtureProof} from './helpers/current_native_proof.mjs';
import {solveTopologyMates, topologyReference, captureLockPose} from '../js/cad_mates.js';
import {createMotionStudy, addRotaryMotor, evaluateMotionStudy} from '../js/cad_motion_study.js';

const axis = (componentId, direction) => topologyReference(componentId, 'face', `axis-${componentId}`,
  {surface:'cylinder', origin:{x:0,y:0,z:0}, axis:{x:0,y:direction,z:0}, radius:.8});
const plane = (componentId, direction) => topologyReference(componentId, 'face', `plane-${componentId}`,
  {surface:'plane', origin:{x:0,y:0,z:0}, normal:{x:0,y:direction,z:0}});

test('a free spindle picked first stays free when its concentric and seat mates target a grounded slide', () => {
  const base={id:'base',grounded:true,transform:{}}, slide={id:'slide',transform:{}}, spindle={id:'spindle',transform:{}};
  const lock={id:'base-slide',type:'lock',a:{componentId:'base',kind:'body'},b:{componentId:'slide',kind:'body'}};
  captureLockPose(lock,base,slide);
  const assembly={components:[base,slide,spindle],topologyMates:[lock,
    {id:'bearing',type:'concentric',a:axis('spindle',-1),b:axis('slide',1)},
    {id:'seat',type:'coincident',a:plane('spindle',-1),b:plane('slide',1)}]};
  const result=solveTopologyMates(assembly);
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.degreesOfFreedom,1,'the ungrounded spindle may still spin');
  assert.equal(result.clusters[0].perComponent.spindle,1);
  assert.equal(result.clusters[0].perComponent.slide,0);

  const reopened=structuredClone(JSON.parse(JSON.stringify(assembly)));
  assert.equal(solveTopologyMates(reopened).degreesOfFreedom,1,'JSON reopen must not invent a ground');
  const study=createMotionStudy(reopened);
  addRotaryMotor(study,'spindle',12,{x:0,y:1,z:0});
  const motion=evaluateMotionStudy(reopened,study.id,1);
  assert.equal(motion.ok,true,JSON.stringify(motion));
  assert.ok(Math.abs(reopened.components[2].transform.ry-72)<1e-6);
  assert.equal(reopened.components[1].transform.ry,0,'the slide stays seated on ground');
});

test('fresh Drill Guide closed loop retains three freedoms with spindle picked as reference', async () => {
  const bundle=JSON.parse(readFileSync(new URL('../artifacts/planchard/DG-assembly-physical-mates-browser-2026-10-03.mforge',import.meta.url),'utf8'));
  const assembly=bundle.assemblies[0];
  const proofs=new Map();
  for(const component of assembly.components){
    const key=JSON.stringify(component.def);
    if(!proofs.has(key))proofs.set(key,await currentNativeFixtureProof(component.def));
    component.def.exactTopologyCache=structuredClone(proofs.get(key));
  }
  assert.equal(assembly.components.length,17);
  assert.equal(assembly.topologyMates.length,22);
  assert.equal(assembly.components.filter(component=>component.grounded).length,1);
  const before=assembly.components.map(component=>structuredClone(component.transform));
  const result=solveTopologyMates(assembly);
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.degreesOfFreedom,3,'feed, linkage motion and spindle spin remain');
  assert.ok(result.clusters.some(cluster=>cluster.components.includes(3026)),'free spindle participates in rank');
  assembly.components.forEach((component,index)=>{
    for(const key of ['x','y','z','rx','ry','rz'])
      assert.ok(Math.abs(component.transform[key]-before[index][key])<1e-9,`${component.id} ${key} moved`);
  });
  assert.equal(solveTopologyMates(assembly).degreesOfFreedom,3,'a repeat solve must retain the rank');

  const reversed=structuredClone(bundle.assemblies[0]);
  for(const mate of reversed.topologyMates)if(mate.id===3049||mate.id===3050)
    [mate.a,mate.b]=[mate.b,mate.a];
  const reversedResult=solveTopologyMates(reversed);
  assert.equal(reversedResult.ok,true,JSON.stringify(reversedResult));
  assert.equal(reversedResult.degreesOfFreedom,3,'reversing symmetric bearing picks preserves mobility');
});

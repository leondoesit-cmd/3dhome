import test from 'node:test';
import assert from 'node:assert/strict';
import {makeBrepPrimitive,extractBrepTopology,fullRoundFilletDefinition,filletBrep,shapeMassProperties,disposeBrep} from '../js/cad_kernel.js';

test('three-face full round derives its radius and removes the flat land within kernel tolerance',async()=>{
 const body=await makeBrepPrimitive({type:'box',w:2,h:5,d:10});let rounded;
 try{
  const topology=extractBrepTopology(body,{ownerFeatureId:'wall'}).topology;
  const face=(axis,value)=>topology.find(t=>t.kind==='face'&&Math.abs(t.descriptor.normal[axis]-value)<1e-8);
  const ids=[face('x',-1),face('y',1),face('x',1)].map(t=>t.persistentId);
  const definition=fullRoundFilletDefinition(body,ids);assert.ok(Math.abs(definition.nominalRadius-1)<1e-12);
  rounded=await filletBrep(body,99,{fullRound:true,facePersistentIds:ids});
  const mass=await shapeMassProperties(rounded);
  assert.ok(Math.abs(mass.volume-(80+5*Math.PI))<1e-6);
  const result=extractBrepTopology(rounded,{ownerFeatureId:'round'}).topology;
  const residual=result.filter(t=>t.kind==='face'&&t.descriptor.surface==='plane'&&t.descriptor.normal.y>.99);
  assert.ok(residual.reduce((sum,t)=>sum+t.descriptor.measure,0)<1e-6,'no measurable flat top remains');
  assert.throws(()=>fullRoundFilletDefinition(body,ids.slice(0,2)),/three faces/);
  assert.throws(()=>fullRoundFilletDefinition(body,[ids[0],ids[0],ids[2]]),/three faces/);
 }finally{if(rounded)disposeBrep(rounded);disposeBrep(body);}
});

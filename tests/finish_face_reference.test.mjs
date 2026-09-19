import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveFinishFace} from '../js/core/finish_face_reference.js';
import {makeBrepPrimitive,extractBrepTopology,fullRoundFilletDefinition,disposeBrep} from '../js/cad_kernel.js';
test('full-round preview resolves picked geometry even when regenerated face IDs were reused',async()=>{
 const body=await makeBrepPrimitive({type:'box',w:2,h:5,d:10});
 try{
  const topology=extractBrepTopology(body,{ownerFeatureId:'body'}).topology;
  const face=(axis,value)=>topology.find(t=>t.kind==='face'&&Math.abs(t.descriptor.normal[axis]-value)<1e-8);
  const desired=[face('x',-1),face('y',1),face('x',1)];
  const picked=desired.map((f,index)=>({...structuredClone(f),persistentId:desired[(index+1)%3].persistentId}));
  const resolved=picked.map(ref=>resolveFinishFace(ref,topology));
  assert.deepEqual(resolved.map(f=>f.persistentId),desired.map(f=>f.persistentId));
  assert.ok(Math.abs(fullRoundFilletDefinition(body,resolved.map(f=>f.persistentId)).nominalRadius-1)<1e-10);
  assert.throws(()=>resolveFinishFace(picked[0],[desired[0],{...desired[0],persistentId:'duplicate'}]),/ambiguous/);
  assert.throws(()=>resolveFinishFace(picked[0],[{...desired[0],descriptor:{...desired[0].descriptor,normal:{x:1,y:0,z:0}}}]),/changed/);
 }finally{disposeBrep(body);}
});

test('exact topology hints win when analytic topology repeats a persistent name',async()=>{
 const body=await makeBrepPrimitive({type:'box',w:2,h:5,d:10});
 try{
  const first=extractBrepTopology(body,{ownerFeatureId:'body'}).topology;
  const left=first.find(t=>t.kind==='face'&&t.descriptor.normal.x<-.99);
  const right=first.find(t=>t.kind==='face'&&t.descriptor.normal.x>.99);
  const expected=[left,{...right,persistentId:left.persistentId},...first];
  const rebuilt=extractBrepTopology(body,{ownerFeatureId:'body',expectedTopology:expected}).topology;
  assert.equal(new Set(rebuilt.map(t=>t.persistentId)).size,rebuilt.length);
  assert.equal(body.subshapes.size,rebuilt.length);
  assert.ok(body.subshapes.get(left.persistentId).descriptor.normal.x<-.99);
  const top=rebuilt.find(t=>t.kind==='face'&&t.descriptor.normal.y>.99);
  const outside=rebuilt.find(t=>t.kind==='face'&&t.descriptor.normal.x>.99);
  assert.ok(fullRoundFilletDefinition(body,[left.persistentId,top.persistentId,outside.persistentId]).radius>0);
 }finally{disposeBrep(body);}
});
